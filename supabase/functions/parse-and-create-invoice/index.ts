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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No se proporcionó token de autorización' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Usuario no autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { prompt } = await req.json()
    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'El parámetro prompt es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Configuración faltante: GEMINI_API_KEY no está definida en los secretos.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

   // Endpoint utilizando el modelo recomendado gemini-3.6-flash
const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`

const geminiResponse = await fetch(geminiUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{
      parts: [{
        text: `Extraé datos de facturación del texto enviado.
Respondé ÚNICAMENTE con un objeto JSON válido, sin bloques de código markdown, con esta estructura exacta:
{"cliente": "string", "concepto": "string", "monto": number, "moneda": "string", "dias_vencimiento": number}

Regla estricta para moneda: Debe ser SIEMPRE un código ISO 4217 de 3 letras en mayúsculas (ej: USD, ARS, EUR, MXN, CLP, COP). NUNCA uses la palabra completa (como 'dólares', 'pesos', 'euros').

Si no identificás cliente o monto, respondé: {"error": true}

Texto a procesar: "${prompt}"`
      }]
    }]
  })
})

    const geminiData = await geminiResponse.json()

    // Si Gemini devuelve un error HTTP (ej. API Key no válida, límite de quota, etc.)
    if (!geminiResponse.ok || geminiData.error) {
      console.error('Error desde la API de Gemini:', geminiData)
      const msg = geminiData.error?.message || 'Error en la llamada a la API de Gemini'
      return new Response(
        JSON.stringify({ error: `Gemini API Error: ${msg}` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''

    if (!rawText) {
      console.error('Gemini devolvió respuesta vacía:', geminiData)
      return new Response(
        JSON.stringify({ error: 'Gemini no devolvió texto en la respuesta.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Limpieza de formato markdown
    const cleanJsonString = rawText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    let parsedInvoice
    try {
      parsedInvoice = JSON.parse(cleanJsonString)
    } catch (e) {
      console.error('Error al parsear JSON:', rawText)
      return new Response(
        JSON.stringify({ error: `No se pudo parsear el JSON generado: ${rawText}` }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (parsedInvoice.error || !parsedInvoice.cliente || !parsedInvoice.monto) {
      return new Response(
        JSON.stringify({ error: 'No se pudieron identificar el cliente o el monto en el texto ingresado.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const numeroFactura = `F-${Math.floor(Date.now() / 1000)}`

    // Inserción en la base de datos
    const { data: insertedInvoice, error: dbError } = await supabaseClient
      .from('facturas')
      .insert({
        usuario_id: user.id,
        numero: numeroFactura,
        cliente: parsedInvoice.cliente,
        concepto: parsedInvoice.concepto || 'Servicios profesionales',
        monto: parsedInvoice.monto,
        moneda: (parsedInvoice.moneda || 'USD').toUpperCase(),
        dias_vencimiento: parsedInvoice.dias_vencimiento || 15,
        estado: 'pendiente',
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error en Supabase DB:', dbError)
      return new Response(
        JSON.stringify({ error: `Error DB: ${dbError.message} (Hint: ${dbError.hint || 'Ninguna'})` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, factura: insertedInvoice }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Error general:', err)
    return new Response(
      JSON.stringify({ error: `Error interno: ${err.message || 'Desconocido'}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})