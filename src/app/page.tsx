'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import Header from '@/components/Header'
import PaymentVerification from '@/components/PaymentVerification'
import PaymentBanner from '@/components/PaymentBanner'
import InvoiceForm from '@/components/InvoiceForm'
import InvoiceList from '@/components/InvoiceList'
import { useRouter } from 'next/navigation'

function MainContent() {
  const [userEmail, setUserEmail] = useState<string>('')
  const [profile, setProfile] = useState<any>(null)
  const [facturas, setFacturas] = useState<any[]>([])
  const [isVerifying, setIsVerifying] = useState(false)
  const [loadingMP, setLoadingMP] = useState(false)
  const [loadingStripe, setLoadingStripe] = useState(false)
  const router = useRouter()

  const loadUserData = async () => {
    // 1. Obtener la sesión activa
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      router.push('/login')
      return
    }

    const user = session.user
    setUserEmail(user.email || '')

    // 2. Cargar perfil (sin single para evitar errores silenciosos de RLS)
    const { data: profileList, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)

    if (profileError) {
      console.error('Error al cargar perfil:', profileError)
    } else if (profileList && profileList.length > 0) {
      console.log('Perfil obtenido desde Supabase:', profileList[0])
      setProfile(profileList[0])
    }

    // 3. Cargar facturas
    const { data: facturasData, error: facturasError } = await supabase
      .from('facturas')
      .select('*')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: false })

    if (facturasError) {
      console.error('Error al cargar facturas:', facturasError)
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

  // Si el plan es 'pago', isLimitReached devolverá false inmediatamente
  const isLimitReached = profile?.plan !== 'pago' && facturasCountMonth >= 5

  const handleCreateInvoice = async (prompt: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-and-create-invoice`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({ prompt, userId: session.user.id }),
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
        facturasCount={facturasCountMonth}
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