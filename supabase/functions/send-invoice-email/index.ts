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

    const { facturaId, emailDestino } = await req.json()

    if (!facturaId || !emailDestino) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros: facturaId y emailDestino son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Obtener los datos de la factura desde la BD respetando RLS
    const { data: factura, error: dbError } = await supabaseClient
      .from('facturas')
      .select('*')
      .eq('id', facturaId)
      .single()

    if (dbError || !factura) {
      return new Response(
        JSON.stringify({ error: 'Factura no encontrada o sin permisos' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'FacturaFácil AI <onboarding@resend.dev>'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Configuración faltante: RESEND_API_KEY no definida.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. HTML profesional y limpio para la plantilla del correo
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #059669; margin-bottom: 8px;">Factura ${factura.numero}</h2>
        <p style="color: #475569; font-size: 15px;">Estimado/a <strong>${factura.cliente}</strong>,</p>
        <p style="color: #475569; font-size: 15px;">Adjuntamos los detalles de la factura emitida:</p>
        
        <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Concepto</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${factura.concepto}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Monto Total</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold; color: #059669;">${factura.moneda} ${factura.monto}</td>
          </tr>
          <tr style="background-color: #f8fafc;">
            <td style="padding: 10px; border: 1px solid #e2e8f0; font-weight: bold;">Plazo de Vencimiento</td>
            <td style="padding: 10px; border: 1px solid #e2e8f0;">${factura.dias_vencimiento} días</td>
          </tr>
        </table>

        <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">
          Enviado a través de FacturaFácil AI
        </p>
      </div>
    `

    // 3. Envío transaccional vía API HTTP de Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [emailDestino],
        subject: `Factura ${factura.numero} - ${factura.concepto}`,
        html: emailHtml,
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Error desde la API de Resend:', resendData)
      return new Response(
        JSON.stringify({ error: `Error enviando email: ${resendData.message || 'Error en Resend'}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Error interno:', err)
    return new Response(
      JSON.stringify({ error: `Error servidor: ${err.message || 'Desconocido'}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
