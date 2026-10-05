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
      const maxAttempts = 5

      const interval = setInterval(async () => {
        attempts += 1
        const { data: { user } } = await supabase.auth.getUser()
        
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', user.id)
            .single()

          if (data?.plan === 'pago' || attempts >= maxAttempts) {
            clearInterval(interval)
            setIsVerifying(false)
            onSuccess()
            router.replace('/')
          }
        }
      }, 2000)

      return () => clearInterval(interval)
    }
  }, [searchParams])

  if (!isVerifying) return null

  return (
    <div className="flex flex-col items-center justify-center min-h-[350px] p-8 text-center bg-gray-900 rounded-xl border border-gray-800">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4"></div>
      <h3 className="text-xl font-bold text-white">Confirmando tu pago...</h3>
      <p className="text-gray-400 text-sm mt-2">
        Estamos activando tu Plan Pro en segundo plano. Esto demorará solo unos segundos.
      </p>
    </div>
  )
}