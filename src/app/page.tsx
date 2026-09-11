'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'

// Definición de la interfaz del tipo Factura
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
  // --- ESTADOS DE LA APLICACIÓN ---
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [prompt, setPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [invoices, setInvoices] = useState<Factura[]>([]) // Arreglo para guardar el historial completo
  const [errorMsg, setErrorMsg] = useState('')

  // --- OBTENER FACTURAS DE SUPABASE (SELECT) ---
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

  // --- ESCUCHA DE SESIÓN DE AUTENTICACIÓN ---
  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        fetchInvoices() // Carga inicial de facturas al detectar sesión
      }
    }

    getUser()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        fetchInvoices()
      } else {
        setInvoices([]) // Limpia el historial al cerrar sesión
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [])

  // --- ACCIONES DE AUTENTICACIÓN ---
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

  // --- LLAMADA A LA EDGE FUNCTION ---
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

      // Limpia el input y recarga la lista de facturas desde la BD
      setPrompt('')
      await fetchInvoices()

    } catch (err: any) {
      setErrorMsg(`Error inesperado: ${err.message || 'Error de conexión'}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // --- PANTALLA DE CARGA ---
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 bg-slate-900 text-white">
        <p className="animate-pulse">Conectando con Supabase...</p>
      </main>
    )
  }

  // --- VISTA PRINCIPAL ---
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
          
          {/* BARRA SUPERIOR DE USUARIO */}
          <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
            <span className="text-sm text-slate-300">
              Conectado como: <strong className="text-white">{user.email}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-lg hover:bg-rose-600/40 transition font-medium"
            >
              Cerrar sesión
            </button>
          </div>

          {/* FORMULARIO DE GENERACIÓN CON IA */}
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

          {/* HISTORIAL DE FACTURAS (SELECT FROM SUPABASE) */}
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-slate-200">Mis Facturas Guardadas ({invoices.length})</h2>

            {invoices.length === 0 ? (
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-xl p-8 text-center text-slate-400">
                Aún no tenés facturas registradas. Escribí una orden arriba para generar la primera.
              </div>
            ) : (
              <div className="grid gap-4">
                {invoices.map((inv) => (
                  <div 
                    key={inv.id} 
                    className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-md flex flex-col gap-3 hover:border-slate-600 transition"
                  >
                    <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                      <span className="font-bold text-emerald-400">{inv.numero}</span>
                      <span className="text-xs px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full font-semibold uppercase tracking-wider">
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
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </main>
  )
}