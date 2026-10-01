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
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: 'Falta configurar STRIPE_SECRET_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const origin = req.headers.get('origin') || 'http://localhost:3000'

    const params = new URLSearchParams()
    params.append('mode', 'payment')
    params.append('payment_method_types[]', 'card')
    params.append('customer_email', email)
    params.append('client_reference_id', userId)
    params.append('line_items[0][price_data][currency]', 'usd')
    params.append('line_items[0][price_data][product_data][name]', 'FacturaFácil AI - Plan Pro Mensual')
    params.append('line_items[0][price_data][unit_amount]', '900') // $9.00 USD (en centavos)
    params.append('line_items[0][quantity]', '1')
    params.append('success_url', `${origin}/?payment=success`)
    params.append('cancel_url', `${origin}/?payment=cancelled`)

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const session = await response.json()

    if (!response.ok) {
      console.error('Error Stripe:', session)
      return new Response(
        JSON.stringify({ error: session.error?.message || 'Error al crear sesión en Stripe' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})