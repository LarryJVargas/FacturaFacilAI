'use client'

import { useState } from 'react'

interface InvoiceFormProps {
  isLimitReached: boolean
  onSubmitInvoice: (prompt: string) => Promise<void>
}

export default function InvoiceForm({ isLimitReached, onSubmitInvoice }: InvoiceFormProps) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || isLimitReached || loading) return

    setLoading(true)
    await onSubmitInvoice(prompt)
    setPrompt('')
    setLoading(false)
  }

  return (
    <div className="p-6 bg-gray-900 border border-gray-800 rounded-xl mb-6">
      <h2 className="text-xl font-bold text-white mb-4">¿Qué querés cobrar?</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLimitReached || loading}
            placeholder={
              isLimitReached
                ? 'Límite mensual alcanzado. Pasate a Pro para seguir generando facturas.'
                : 'Ejemplo: Cobro a Juan Pérez por diseño de logo $50.000...'
            }
            rows={3}
            className="w-full p-4 bg-gray-950 border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:bg-gray-900 disabled:cursor-not-allowed resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isLimitReached || loading || !prompt.trim()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Generando factura...</span>
            </>
          ) : (
            'Generar Factura con AI'
          )}
        </button>
      </form>
    </div>
  )
}