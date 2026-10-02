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
    const backUrl = rawOrigin.includes('localhost')
      ? 'https://example.com'
      : `${rawOrigin}/?payment=success`

    // Se usa el email del usuario logueado en la app
    const payerEmail = email || 'comprador_test@test.com'

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpAccessToken.trim()}`,
      },
      body: JSON.stringify({
        items: [
          {
            id: 'plan-pro-suscripcion',
            title: 'FacturaFácil AI - Suscripción Plan Pro (Mensual)',
            quantity: 1,
            unit_price: 12000,
            currency_id: 'ARS',
          },
        ],
        payer: {
          email: payerEmail,
        },
        external_reference: userId,
        back_urls: {
          success: backUrl,
          failure: `${rawOrigin}/?payment=failure`,
          pending: `${rawOrigin}/?payment=pending`,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Error desde Mercado Pago API:', data)
      return new Response(
        JSON.stringify({ error: data.message || data.error || 'Error al generar checkout en MP' }),
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