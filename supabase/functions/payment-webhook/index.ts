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
      throw new Error('Faltan variables de entorno de Supabase')
    }

    // Cliente con Service Role para bypass de RLS y actualizar el perfil del usuario
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const provider = url.searchParams.get('provider') // 'stripe' o 'mercadopago'

    // -------------------------------------------------------------
    // 1. WEBHOOK DE STRIPE
    // -------------------------------------------------------------
    if (provider === 'stripe') {
      const event = await req.json()

      // Evento cuando una suscripción o pago de checkout se completa exitosamente
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        const userId = session.client_reference_id

        if (userId) {
          const { error } = await supabaseAdmin
            .from('profiles')
            .update({ plan: 'pago' })
            .eq('id', userId)

          if (error) {
            console.error('Error al actualizar plan en Supabase (Stripe):', error)
            return new Response(JSON.stringify({ error: error.message }), { status: 500 })
          }

          console.log(`Plan actualizado a 'pago' para el usuario Stripe: ${userId}`)
        }
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    // -------------------------------------------------------------
    // 2. WEBHOOK DE MERCADO PAGO
    // -------------------------------------------------------------
    if (provider === 'mercadopago') {
      const body = await req.json()
      const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')

      // MP envía notificaciones de tipo 'payment' o 'preapproval'
      const topic = body.type || body.topic
      const dataId = body.data?.id || body.id

      if ((topic === 'payment' || topic === 'preapproval') && dataId) {
        // Consultar el estado directamente a la API de Mercado Pago
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

          // Si el pago o la suscripción fue aprobada/autorizada
          if ((status === 'approved' || status === 'authorized') && userId) {
            const { error } = await supabaseAdmin
              .from('profiles')
              .update({ plan: 'pago' })
              .eq('id', userId)

            if (error) {
              console.error('Error al actualizar plan en Supabase (Mercado Pago):', error)
              return new Response(JSON.stringify({ error: error.message }), { status: 500 })
            }

            console.log(`Plan actualizado a 'pago' para el usuario MP: ${userId}`)
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 })
    }

    return new Response(JSON.stringify({ error: 'Proveedor no soportado' }), { status: 400 })
  } catch (err: any) {
    console.error('Error en payment-webhook:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})