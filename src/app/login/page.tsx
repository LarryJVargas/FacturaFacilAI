'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirigir al dashboard principal cuando haya una sesión activa
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push('/')
        router.refresh()
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  return (
    <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">FacturaFácil AI</h1>
          <p className="text-gray-400 text-sm">Ingresá o creá tu cuenta para continuar</p>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#2563eb',
                  brandAccent: '#1d4ed8',
                  inputBackground: '#030712',
                  inputText: '#ffffff',
                  inputPlaceholder: '#9ca3af',
                  inputBorder: '#1f2937',
                  inputBorderFocus: '#2563eb',
                  inputBorderHover: '#374151',
                },
              },
            },
          }}
          providers={['google']}
          redirectTo={`${typeof window !== 'undefined' ? window.location.origin : ''}/`}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Correo electrónico',
                password_label: 'Contraseña',
                button_label: 'Iniciar sesión',
                loading_button_label: 'Iniciando sesión...',
                link_text: '¿Ya tenés una cuenta? Iniciar sesión',
              },
              sign_up: {
                email_label: 'Correo electrónico',
                password_label: 'Contraseña',
                button_label: 'Registrarse',
                loading_button_label: 'Registrando...',
                link_text: '¿No tenés cuenta? Registrate',
              },
              forgotten_password: {
                email_label: 'Correo electrónico',
                button_label: 'Restablecer contraseña',
                link_text: '¿Olvidaste tu contraseña?',
              },
            },
          }}
        />
      </div>
    </main>
  )
}