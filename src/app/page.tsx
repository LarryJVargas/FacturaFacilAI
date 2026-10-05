'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PaymentVerification from '@/components/PaymentVerification'
import PaymentBanner from '@/components/PaymentBanner'
import InvoiceForm from '@/components/InvoiceForm'
import InvoiceList from '@/components/InvoiceList'

function MainContent() {
  const [userEmail, setUserEmail] = useState<string>('')
  const [profile, setProfile] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [isVerifying, setIsVerifying] = useState(false)
  const [loadingMP, setLoadingMP] = useState(false)
  const [loadingStripe, setLoadingStripe] = useState(false)

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email || '')

    // 1. Cargar Perfil
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    setProfile(profileData)

    // 2. Cargar todas las facturas del usuario ordenadas por fecha
    const { data: facturasData, error } = await supabase
      .from('facturas')
      .select('*')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error al cargar facturas:', error)
    } else if (facturasData) {
      setFacturas(facturasData)
    }
  }

  useEffect(() => {
    loadUserData()
  }, [])

  // CALCULAR FACTURAS DEL MES EN CURSO
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const facturasEsteMes = facturas.filter((factura) => {
    if (!factura.created_at) return false
    const fechaFactura = new Date(factura.created_at)
    return (
      fechaFactura.getMonth() === currentMonth &&
      fechaFactura.getFullYear() === currentYear
    )
  })

  const facturasCountMonth = facturasEsteMes.length

  // La condición del límite evalúa solo las facturas del mes actual
  const isLimitReached = profile?.plan !== 'pago' && facturasCountMonth >= 5

  const handleCreateInvoice = async (prompt: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-and-create-invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, userId: user.id }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        alert(errorData.error || 'Error al procesar la factura con IA')
        return
      }

      await loadUserData()
    } catch (err) {
      console.error('Error al generar factura:', err)
    }
  }

  const handlePayMP = async () => {
    setLoadingMP(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-mp-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, email: user?.email }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingMP(false)
    }
  }

  const handlePayStripe = async () => {
    setLoadingStripe(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, email: user?.email }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingStripe(false)
    }
  }

  return (
    <main className="w-full max-w-5xl mx-auto p-4 sm:p-6 min-h-screen text-white">
      <Header
        email={userEmail || profile?.email}
        facturasCount={facturasCountMonth} // Muestra sólo las del mes actual en el banner superior
        plan={profile?.plan}
      />

      <PaymentVerification
        isVerifying={isVerifying}
        setIsVerifying={setIsVerifying}
        onSuccess={loadUserData}
      />

      {!isVerifying && (
        <div className="space-y-6">
          <InvoiceForm
            isLimitReached={isLimitReached}
            onSubmitInvoice={handleCreateInvoice}
          />

          {isLimitReached && (
            <PaymentBanner
              onPayMercadoPago={handlePayMP}
              onPayStripe={handlePayStripe}
              isLoadingMP={loadingMP}
              isLoadingStripe={loadingStripe}
            />
          )}

          {/* El listado abajo sigue mostrando el historial completo (14) */}
          <InvoiceList facturas={facturas} />
        </div>
      )}
    </main>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-white bg-gray-950 min-h-screen">Cargando FacturaFácil AI...</div>}>
      <MainContent />
    </Suspense>
  )
}