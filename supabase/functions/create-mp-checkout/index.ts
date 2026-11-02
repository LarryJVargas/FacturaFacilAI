import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, email } = await req.json()
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN')

    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: 'Falta configurar MP_ACCESS_TOKEN en Supabase secrets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawOrigin = req.headers.get('origin') || 'http://localhost:3000'
    const successUrl = `${rawOrigin}/?payment=success`
    const failureUrl = `${rawOrigin}/?payment=failure`
    const pendingUrl = `${rawOrigin}/?payment=pending`

    // Email de test para evitar colisión si el email del comprador es el del vendedor en Sandbox
    const testEmail = 'test_user_123456@testuser.com'

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken.trim()}`,
      },
      body: JSON.stringify({
        items: [
          {
            title: 'FacturaFácil AI - Suscripción Plan Pro (Mensual)',
            quantity: 1,
            unit_price: 12000,
            currency_id: 'ARS',
          },
        ],
        payer: {
          email: testEmail,
        },
        external_reference: userId,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: 'approved',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error detallado de MP:', JSON.stringify(data))
      return new Response(
        JSON.stringify({ error: data.message || data.cause?.[0]?.description || 'Error en preferencia de MP' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const checkoutUrl = data.init_point || data.sandbox_init_point

    return new Response(
      JSON.stringify({ url: checkoutUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})