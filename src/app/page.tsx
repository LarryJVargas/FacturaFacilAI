'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

interface Factura {
  id: string
  numero: string
  cliente: string
  concepto: string
  monto: number
  moneda: string
  dias_vencimiento: number
  estado: string
  created_at: string
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Factura[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  // Estado para almacenar el total de facturas del mes
  const [monthlyCount, setMonthlyCount] = useState<number>(0)

  // Función para obtener el número de facturas creadas en el mes actual
  const fetchMonthlyInvoiceCount = async (userId: string) => {
    try {
      // 1. Obtener la fecha de inicio del mes actual (ej: 2026-09-01T00:00:00.000Z)
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      // 2. Realizar la consulta con count: 'exact' e head: true (solo trae la cantidad, sin descargar los datos)
      const { count, error } = await supabase
        .from('facturas')
        .select('id', { count: 'exact'})
        .eq('usuario_id', userId)
        .gte('fecha_creacion', startOfMonth)

      if (error) {
        console.error('Error al contar las facturas del mes:', error.message || error)
      } else {
        setMonthlyCount(count || 0)
      }
    } catch (err) {
      console.error('Error inesperado al contar facturas del mes:', err)
    }
  }

  const getWhatsAppUrl = (inv: Factura) => {
    const mensaje = `Hola ${inv.cliente}, te envío la factura *${inv.numero}* por un total de *${inv.moneda} ${inv.monto}* en concepto de: "${inv.concepto}". Vence en ${inv.dias_vencimiento} días.`
    return `https://wa.me/?text=${encodeURIComponent(mensaje)}`
  }

  // --- PROGRAMAR RECORDATORIOS (~35%, ~70%, 100%) ---
  const programarRecordatorios = async (factura: Factura, userId: string) => {
    try {
      const { data: existentes } = await supabase
        .from('recordatorios')
        .select('id')
        .eq('factura_id', factura.id)

      if (existentes && existentes.length > 0) {
        return
      }

      const fechaEmision = new Date(factura.created_at || Date.now())
      const diasTotales = factura.dias_vencimiento || 15

      const diasSuave = Math.max(1, Math.round(diasTotales * 0.35))
      const diasDirecto = Math.max(2, Math.round(diasTotales * 0.70))
      const diasVencimiento = diasTotales

      const fechaSuave = new Date(fechaEmision.getTime() + diasSuave * 24 * 60 * 60 * 1000)
      const fechaDirecto = new Date(fechaEmision.getTime() + diasDirecto * 24 * 60 * 60 * 1000)
      const fechaVencimiento = new Date(fechaEmision.getTime() + diasVencimiento * 24 * 60 * 60 * 1000)

      const nuevosRecordatorios = [
        {
          factura_id: factura.id,
          usuario_id: userId,
          tipo: 'suave',
          fecha_programada: fechaSuave.toISOString(),
          enviado: false,
        },
        {
          factura_id: factura.id,
          usuario_id: userId,
          tipo: 'directo',
          fecha_programada: fechaDirecto.toISOString(),
          enviado: false,
        },
        {
          factura_id: factura.id,
          usuario_id: userId,
          tipo: 'vencimiento',
          fecha_programada: fechaVencimiento.toISOString(),
          enviado: false,
        },
      ]

      const { error } = await supabase.from('recordatorios').insert(nuevosRecordatorios)

      if (error) {
        console.error('Error al programar recordatorios:', error.message)
      } else {
        console.log('Recordatorios programados para la factura', factura.numero)
      }
    } catch (err) {
      console.error('Error inesperado al programar recordatorios:', err)
    }
  }

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from('facturas')
        .select('*')
        .order('id', { ascending: false })

      if (error) {
        console.error('Error al cargar facturas:', error.message)
      } else {
        setInvoices(data || [])
      }
    } catch (err: any) {
      console.error('Error al consultar la base de datos:', err)
    }
  }

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        fetchInvoices()
        fetchMonthlyInvoiceCount(currentUser.id) // <-- Conteo mensual inicial
      }
    }

    getUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        fetchInvoices()
        fetchMonthlyInvoiceCount(currentUser.id) // <-- Conteo mensual en login
      } else {
        setInvoices([])
        setMonthlyCount(0)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setInvoices([])
  }

  const handleCreateInvoice = async () => {
    if (!prompt.trim()) return

    setIsGenerating(true)
    setErrorMsg('')

    try {
      const { data, error } = await supabase.functions.invoke('parse-and-create-invoice', {
        body: { prompt },
      })

      if (error) {
        let serverErrorMsg = 'Error en la Edge Function'
        try {
          if (error.context && typeof error.context.json === 'function') {
            const errBody = await error.context.json()
            serverErrorMsg = errBody.error || serverErrorMsg
          } else if (error.message) {
            serverErrorMsg = error.message
          }
        } catch (e) {
          serverErrorMsg = error.message || serverErrorMsg
        }
        setErrorMsg(serverErrorMsg)
        return
      }

      if (data?.error) {
        setErrorMsg(data.error)
        return
      }

      setPrompt('')
      await fetchInvoices()
      if (user) {
      await fetchMonthlyInvoiceCount(user.id) // <-- Actualiza el contador mensual
      }

    } catch (err: any) {
      setErrorMsg(`Error inesperado: ${err.message || 'Error de conexión'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSendEmail = async (inv: Factura) => {
    const emailDestino = user?.email

    if (!emailDestino) {
      alert('No se detectó la dirección de correo del usuario.')
      return
    }

    setSendingEmailId(inv.id)

    try {
      const { data, error } = await supabase.functions.invoke('send-invoice-email', {
        body: { facturaId: inv.id, emailDestino },
      })

      if (error || data?.error) {
        alert(`Error al enviar el email: ${error?.message || data?.error}`)
      } else {
        if (user) {
          await programarRecordatorios(inv, user.id)
        }
        alert(`¡Factura enviada por correo a ${emailDestino} y recordatorios programados!`)
      }
    } catch (err: any) {
      alert(`Error de conexión: ${err.message}`)
    } finally {
      setSendingEmailId(null)
    }
  }

  const handleWhatsAppClick = async (inv: Factura) => {
    if (user) {
      await programarRecordatorios(inv, user.id)
    }
  }

  const handleMarkAsPaid = async (facturaId: string) => {
    setUpdatingStatusId(facturaId)

    try {
      const { error } = await supabase
        .from('facturas')
        .update({ estado: 'pagada' })
        .eq('id', facturaId)

      if (error) {
        alert(`Error al actualizar estado: ${error.message}`)
      } else {
        await fetchInvoices()
      }
    } catch (err: any) {
      alert(`Error inesperado: ${err.message}`)
    } finally {
      setUpdatingStatusId(null)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-slate-900 text-white">
        <p className="animate-pulse">Conectando con Supabase...</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-6 bg-slate-900 text-slate-100 gap-6">
      <h1 className="text-3xl font-bold tracking-tight mt-6">FacturaFácil AI</h1>

      {!user ? (
        <div className="flex flex-col items-center gap-4 bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-xl max-w-md w-full my-auto">
          <p className="text-amber-400 font-medium text-center">Iniciá sesión para empezar a generar facturas</p>
          <button
            onClick={handleGoogleLogin}
            className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 transition shadow-md"
          >
            Iniciar sesión con Google
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-6 max-w-2xl w-full pb-12">
          
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
            <span className="text-sm text-slate-300">
              Conectado como: <strong className="text-white">{user.email}</strong>
              <span className="text-xs text-emerald-400 font-medium mt-0.5">
                Facturas creadas este mes: <strong>{monthlyCount}</strong>
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-600/40 transition font-medium"
            >
              Cerrar sesión
            </button>
          </div>

          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col gap-4 shadow-md">
            <label className="text-sm font-semibold text-slate-200">
              ¿Qué querés cobrar?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej: Facturale a Carlos 800 dólares por la app móvil, que pague en 7 días"
              className="w-full p-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 text-sm resize-none h-24"
            />
            <button
              onClick={handleCreateInvoice}
              disabled={isGenerating || !prompt.trim()}
              className="py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition shadow-md"
            >
              {isGenerating ? 'Generando e insertando en la BD...' : 'Generar Factura'}
            </button>

            {errorMsg && (
              <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/50 p-2.5 rounded-lg">
                ⚠️ {errorMsg}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-slate-200">Mis Facturas Guardadas ({invoices.length})</h2>

            {invoices.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400">
                Aún no tenés facturas registradas. Escribí una orden arriba para generar la primera.
              </div>
            ) : (
              <div className="grid gap-4">
                {invoices.map((inv) => {
                  const isPagada = inv.estado?.toLowerCase() === 'pagada'

                  return (
                    <div 
                      key={inv.id} 
                      className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md flex flex-col gap-4 hover:border-slate-600 transition"
                    >
                      <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                        <span className="font-bold text-emerald-400">{inv.numero}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider border ${
                          isPagada 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {inv.estado}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-slate-400 block text-xs">Cliente</span>
                          <span className="font-medium text-slate-200">{inv.cliente}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">Concepto</span>
                          <span className="font-medium text-slate-200">{inv.concepto}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">Vencimiento</span>
                          <span className="font-medium text-slate-200">{inv.dias_vencimiento} días</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-xs">Total</span>
                          <span className="font-bold text-emerald-400">{inv.moneda} {inv.monto}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <a
                            href={getWhatsAppUrl(inv)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleWhatsAppClick(inv)}
                            className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-medium text-xs rounded-lg transition"
                          >
                            WhatsApp
                          </a>

                          <button
                            onClick={() => handleSendEmail(inv)}
                            disabled={sendingEmailId === inv.id}
                            className="inline-flex items-center justify-center gap-2 w-full py-2 px-3 bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 font-medium text-xs rounded-lg transition disabled:opacity-50"
                          >
                            {sendingEmailId === inv.id ? 'Enviando...' : 'Enviar por Email'}
                          </button>
                        </div>

                        {!isPagada && (
                          <button
                            onClick={() => handleMarkAsPaid(inv.id)}
                            disabled={updatingStatusId === inv.id}
                            className="w-full py-2 px-3 bg-slate-700/60 hover:bg-slate-700 text-slate-200 border border-slate-600 font-medium text-xs rounded-lg transition disabled:opacity-50"
                          >
                            {updatingStatusId === inv.id ? 'Actualizando...' : 'Marcar como pagada'}
                          </button>
                        )}
                      </div>

                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </main>
  )
}