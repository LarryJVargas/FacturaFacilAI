import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
      return new Response(JSON.stringify({ error: 'Error de variables de entorno' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cliente Admin para saltarse el Row Level Security (RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const provider = url.searchParams.get('provider')

    // Leer el body UNA SOLA VEZ
    const body = await req.json()

    // -------------------------------------------------------------
    // 1. STRIPE WEBHOOK
    // -------------------------------------------------------------
    if (provider === 'stripe' || body.object === 'event' || body.type?.startsWith('checkout.')) {
      const event = body

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        const userId = session.client_reference_id

        console.log(`Evento checkout.session.completed recibido. userId: ${userId}`)

        if (userId) {
          const { error } = await supabaseAdmin
            .from('profiles')
            .update({ plan: 'pago' })
            .eq('id', userId)

          if (error) {
            console.error('Error al actualizar plan en Supabase (Stripe):', error)
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }

          console.log(`Plan actualizado exitosamente a 'pago' para el usuario Stripe: ${userId}`)
        } else {
          console.warn('El evento checkout.session.completed no contenia client_reference_id')
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // -------------------------------------------------------------
    // 2. MERCADO PAGO WEBHOOK
    // -------------------------------------------------------------
    if (provider === 'mercadopago') {
      const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')
      const topic = body.type || body.topic
      const dataId = body.data?.id || body.id

      if ((topic === 'payment' || topic === 'preapproval') && dataId) {
        const endpoint = topic === 'payment'
          ? `https://api.mercadopago.com/v1/payments/${dataId}`
          : `https://api.mercadopago.com/preapproval/${dataId}`

        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${mpAccessToken?.trim()}` },
        })

        if (res.ok) {
          const paymentData = await res.json()
          const status = paymentData.status
          const userId = paymentData.external_reference

          if ((status === 'approved' || status === 'authorized') && userId) {
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({ plan: 'pago' })
              .eq('id', userId)

            if (error) {
              console.error('Error al actualizar plan en Supabase (MP):', error)
              return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              })
            }

            console.log(`Plan actualizado exitosamente a 'pago' para el usuario MP: ${userId}`)
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Proveedor no soportado' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Error procesando payment-webhook:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})