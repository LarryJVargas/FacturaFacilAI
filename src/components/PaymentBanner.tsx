'use client'

interface PaymentBannerProps {
  onPayMercadoPago: () => void
  onPayStripe: () => void
  isLoadingMP: boolean
  isLoadingStripe: boolean
}

export default function PaymentBanner({
  onPayMercadoPago,
  onPayStripe,
  isLoadingMP,
  isLoadingStripe,
}: PaymentBannerProps) {
  return (
    <div className="p-6 bg-amber-950/40 border border-amber-800/60 rounded-xl mb-6">
      <h3 className="text-lg font-bold text-amber-400 mb-1">
        Llegaste al límite gratis de este mes (5/5)
      </h3>
      <p className="text-gray-300 text-sm mb-4">
        Elegí tu método de pago para pasar a Plan Pro con facturación e historial ilimitados:
      </p>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={onPayMercadoPago}
          disabled={isLoadingMP}
          className="flex-1 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoadingMP ? 'Cargando...' : 'AR Mercado Pago (Pesos)'}
        </button>

        <button
          onClick={onPayStripe}
          disabled={isLoadingStripe}
          className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoadingStripe ? 'Cargando...' : '💳 Tarjeta Internacional ($12 USD)'}
        </button>
      </div>
    </div>
  )
}