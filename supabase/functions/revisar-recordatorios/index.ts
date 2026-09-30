import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función helper para generar el asunto y cuerpo según el tipo de recordatorio
function getEmailTemplate(tipo: string, factura: any) {
  switch (tipo) {
    case 'suave':
      return {
        subject: `Recordatorio amigable: Factura ${factura.numero}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0284c7;">Hola, ${factura.cliente} 👋</h2>
            <p style="color: #334155; font-size: 15px;">
              Te escribo para recordarte amigablemente sobre la factura <strong>${factura.numero}</strong> por <strong>${factura.moneda} ${factura.monto}</strong> en concepto de <em>"${factura.concepto}"</em>.
            </p>
            <p style="color: #334155; font-size: 15px;">
              Pasaba a dejártela por si se traspapeó entre tus correos. ¡Cualquier duda decime!
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enviado automáticamente vía FacturaFácil AI</p>
          </div>
        `
      }
    case 'directo':
      return {
        subject: `Seguimiento de pago: Factura ${factura.numero}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #d97706;">Hola, ${factura.cliente}</h2>
            <p style="color: #334155; font-size: 15px;">
              Te contacto para dar seguimiento a la factura <strong>${factura.numero}</strong> por el monto de <strong>${factura.moneda} ${factura.monto}</strong> (Concepto: "${factura.concepto}").
            </p>
            <p style="color: #334155; font-size: 15px;">
              Estamos próximos a la fecha de vencimiento. ¿Podremos coordinar el pago para estos días?
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enviado automáticamente vía FacturaFácil AI</p>
          </div>
        `
      }
    case 'vencimiento':
    default:
      return {
        subject: `⚠️ FACTURA VENCIDA: ${factura.numero}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fca5a5; border-radius: 8px; background-color: #fef2f2;">
            <h2 style="color: #dc2626;">Estimado/a ${factura.cliente},</h2>
            <p style="color: #334155; font-size: 15px;">
              Te notificamos que la factura <strong>${factura.numero}</strong> por <strong>${factura.moneda} ${factura.monto}</strong> ha alcanzado su fecha límite de pago.
            </p>
            <p style="color: #334155; font-size: 15px;">
              Por favor, confirmanos la fecha estimada en que estarás realizando la transferencia o el comprobante si ya fue abonada.
            </p>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">Enviado automáticamente vía FacturaFácil AI</p>
          </div>
        `
      }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const emailFrom = Deno.env.get('EMAIL_FROM') || 'FacturaFácil AI <onboarding@resend.dev>'

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'Falta configurar RESEND_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ahora = new Date().toISOString()

    // 1. Obtener recordatorios donde fecha_programada <= hoy y enviado = false
    const { data: recordatoriosPendientes, error: dbError } = await supabaseAdmin
      .from('recordatorios')
      .select(`
        id,
        tipo,
        fecha_programada,
        enviado,
        usuario_id,
        facturas (
          id,
          numero,
          cliente,
          concepto,
          monto,
          moneda,
          dias_vencimiento,
          estado
        )
      `)
      .eq('enviado', false)
      .lte('fecha_programada', ahora)

    if (dbError) {
      return new Response(
        JSON.stringify({ error: `Error DB: ${dbError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!recordatoriosPendientes || recordatoriosPendientes.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No hay recordatorios pendientes para hoy.', procesados: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Solo procesar si la factura asociada sigue PENDIENTE
    const recordatoriosAEnviar = recordatoriosPendientes.filter(
      (rec: any) => rec.facturas && rec.facturas.estado?.toLowerCase() === 'pendiente'
    )

    const idsProcesadosExitosamente: string[] = []

    // 3. Iterar y enviar correos transaccionales por Resend
    for (const rec of recordatoriosAEnviar) {
      const factura = rec.facturas
      
      // Consultar el email del usuario propietario de la factura para enviar el aviso
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(rec.usuario_id)
      const emailDestino = userData?.user?.email

      if (!emailDestino) {
        console.warn(`No se encontró email para el usuario ${rec.usuario_id}`)
        continue
      }

      const { subject, html } = getEmailTemplate(rec.tipo, factura)

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [emailDestino],
          subject: subject,
          html: html,
        }),
      })

      if (resendRes.ok) {
        idsProcesadosExitosamente.push(rec.id)
      } else {
        const errJson = await resendRes.json()
        console.error(`Error al enviar recordatorio ${rec.id} vía Resend:`, errJson)
      }
    }

    // 4. Marcar como enviado = true únicamente los procesados con éxito
    if (idsProcesadosExitosamente.length > 0) {
      await supabaseAdmin
        .from('recordatorios')
        .update({ enviado: true })
        .in('id', idsProcesadosExitosamente)
    }

    return new Response(
      JSON.stringify({
        success: true,
        procesados: idsProcesadosExitosamente.length,
        totalesEncontrados: recordatoriosAEnviar.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Error servidor: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})