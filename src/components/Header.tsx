'use client'

import { supabase } from '@/lib/supabase'

interface HeaderProps {
  email?: string
  facturasCount: number
  plan?: string
}

export default function Header({ email, facturasCount, plan }: HeaderProps) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <header className="flex flex-wrap items-center justify-between p-4 bg-gray-900/80 border border-gray-800 rounded-xl mb-6 gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-300">
          Conectado como: <strong className="text-white">{email || 'Cargando...'}</strong>
        </span>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
          plan === 'pago' 
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
            : 'bg-emerald-900/40 text-emerald-400 border border-emerald-800/50'
        }`}>
          Facturas creadas este mes: {facturasCount}
        </span>
      </div>

      <button
        onClick={handleLogout}
        className="text-sm text-gray-400 hover:text-red-400 border border-gray-800 hover:border-red-500/50 px-3 py-1.5 rounded-lg transition-colors bg-gray-950/50"
      >
        Cerrar sesión
      </button>
    </header>
  )
}