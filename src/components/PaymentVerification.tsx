'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface PaymentVerificationProps {
  isVerifying: boolean
  setIsVerifying: (value: boolean) => void
  onSuccess: () => void
}

export default function PaymentVerification({
  isVerifying,
  setIsVerifying,
  onSuccess,
}: PaymentVerificationProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const paymentStatus = searchParams.get('payment')

    if (paymentStatus === 'success') {
      setIsVerifying(true)
      let attempts = 0
      const maxAttempts = 5 // 5 intentos * 2s = 10 segundos máximo

      const interval = setInterval(async () => {
        attempts += 1
        const { data: { user } } = await supabase.auth.getUser()

        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .maybeSingle()

          // Si el webhook ya actualizó el plan a 'pago' o se alcanzaron los intentos
          if (data?.plan === 'pago' || attempts >= maxAttempts) {
            clearInterval(interval)
            setIsVerifying(false)
            await onSuccess() // Recarga el perfil y las facturas en el parent
            router.replace('/') // Limpia ?payment=success de la URL
          }
        }
      }, 2000)

      return () => clearInterval(interval)
    }
  }, [searchParams])

  if (!isVerifying) return null

  return (
    <div className="flex flex-col items-center justify-center min-h-[350px] p-8 text-center bg-gray-900/90 border border-emerald-500/30 rounded-2xl shadow-xl my-6">
      <div className="animate-spin rounded-full h-14 w-14 border-4 border-emerald-500/20 border-t-emerald-500 mb-6"></div>
      <h3 className="text-2xl font-bold text-white mb-2">Confirmando tu pago...</h3>
      <p className="text-gray-300 max-w-md text-sm leading-relaxed">
        Estamos activando tu suscripción en segundo plano. Esto puede tomar solo un par de segundos mientras procesamos la confirmación.
      </p>
    </div>
  )
}