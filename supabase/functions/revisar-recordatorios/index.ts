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
    // Usamos el Service Role Key o Anon Key para consultas de mantenimiento del sistema
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const ahora = new Date().toISOString()

    // 1. Consultar recordatorios pendientes con fecha_programada <= hoy (NOW)
    //    y unir la relación con la tabla de facturas
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
      console.error('Error al consultar recordatorios pendientes:', dbError)
      return new Response(
        JSON.stringify({ error: `Error DB: ${dbError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!recordatoriosPendientes || recordatoriosPendientes.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No hay recordatorios pendientes para procesar hoy.', procesados: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Filtrar solo facturas que sigan en estado 'pendiente' (ignorar facturas pagadas)
    const recordatoriosValidos = recordatoriosPendientes.filter(
      (rec: any) => rec.facturas && rec.facturas.estado?.toLowerCase() === 'pendiente'
    )

    // 3. Procesar los recordatorios (Acá se llamará a Resend/Email en el siguiente paso)
    const idsProcesados: string[] = []

    for (const rec of recordatoriosValidos) {
      console.log(`Procesando recordatorio ID ${rec.id} (Tipo: ${rec.tipo}) para factura ${rec.facturas.numero}`)
      idsProcesados.push(rec.id)
    }

    // 4. Marcar los recordatorios procesados como enviados = true
    if (idsProcesados.length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('recordatorios')
        .update({ enviado: true })
        .in('id', idsProcesados)

      if (updateError) {
        console.error('Error al actualizar estado de recordatorios:', updateError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        procesados: idsProcesados.length,
        detalles: recordatoriosValidos,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('Error en la revisión de recordatorios:', err)
    return new Response(
      JSON.stringify({ error: `Error servidor: ${err.message || 'Desconocido'}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})