import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Genera la plantilla de email según el tipo de recordatorio
function getEmailTemplate(tipo: string, factura: any) {
  // Construimos el mensaje de WhatsApp que usará el usuario
  const textoWhatsApp = `Hola ${factura.cliente}, te escribo respecto a la factura *${factura.numero}* por *${factura.moneda} ${factura.monto}* (${factura.concepto}).`
  const waUrl = `https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`

  switch (tipo) {
    case 'suave':
      return {
        subject: `🔔 Recordatorio listo para enviar: Factura ${factura.numero} (${factura.cliente})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0284c7; margin-bottom: 8px;">Recordatorio Suave Listo</h2>
            <p style="color: #334155; font-size: 15px;">
              Hola, tu recordatorio inicial para la factura <strong>${factura.numero}</strong> de <strong>${factura.cliente}</strong> (${factura.moneda} ${factura.monto}) ya se puede enviar.
            </p>
            <p style="color: #334155; font-size: 15px;">
              Hacé clic en el siguiente botón para abrir WhatsApp con el mensaje redactado:
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${waUrl}" target="_blank" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
                Enviar WhatsApp a ${factura.cliente}
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">FacturaFácil AI - Notificación para el usuario</p>
          </div>
        `
      }
    case 'directo':
      return {
        subject: `⚠️ Seguimiento de cobro pendiente: Factura ${factura.numero} (${factura.cliente})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #d97706; margin-bottom: 8px;">Seguimiento Directo Requerido</h2>
            <p style="color: #334155; font-size: 15px;">
              Es momento de coordinar el pago de la factura <strong>${factura.numero}</strong> de <strong>${factura.cliente}</strong> por <strong>${factura.moneda} ${factura.monto}</strong>.
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${waUrl}" target="_blank" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
                Enviar WhatsApp a ${factura.cliente}
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">FacturaFácil AI - Notificación para el usuario</p>
          </div>
        `
      }
    case 'vencimiento':
    default:
      return {
        subject: `🚨 ALERTA: Factura Vencida ${factura.numero} (${factura.cliente})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fca5a5; border-radius: 8px; background-color: #fef2f2;">
            <h2 style="color: #dc2626; margin-bottom: 8px;">Factura Alcanzó la Fecha Límite</h2>
            <p style="color: #334155; font-size: 15px;">
              La factura <strong>${factura.numero}</strong> emitida a <strong>${factura.cliente}</strong> por <strong>${factura.moneda} ${factura.monto}</strong> ha alcanzado su vencimiento sin registrar pago.
            </p>
            <div style="text-align: center; margin: 25px 0;">
              <a href="${waUrl}" target="_blank" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
                Enviar Reclamo por WhatsApp
              </a>
            </div>
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 30px;">FacturaFácil AI - Notificación para el usuario</p>
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

    // 1. Obtener recordatorios con fecha_programada <= hoy y enviado = false
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
        JSON.stringify({ message: 'No hay recordatorios pendientes para procesar.', procesados: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Filtrar únicamente las facturas en estado 'pendiente'
    const recordatoriosAEnviar = recordatoriosPendientes.filter(
      (rec: any) => rec.facturas && rec.facturas.estado?.toLowerCase() === 'pendiente'
    )

    const idsProcesadosExitosamente: string[] = []

    // 3. Enviar aviso al email del usuario con el enlace a WhatsApp
    for (const rec of recordatoriosAEnviar) {
      const factura = rec.facturas
      
      // Obtenemos el correo del usuario (freelancer)
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(rec.usuario_id)
      const emailUsuario = userData?.user?.email

      if (!emailUsuario) {
        console.warn(`No se encontró email para el usuario ID ${rec.usuario_id}`)
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
          to: [emailUsuario], // Correo enviado al USUARIO de FacturaFácil AI
          subject: subject,
          html: html,
        }),
      })

      if (resendRes.ok) {
        idsProcesadosExitosamente.push(rec.id)
      } else {
        const errJson = await resendRes.json()
        console.error(`Error al procesar recordatorio ${rec.id}:`, errJson)
      }
    }

    // 4. Marcar como enviados para que no se reenvíen
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