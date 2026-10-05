'use client'

interface Factura {
  id: string
  numero: string
  cliente: string
  concepto: string
  monto: number
  moneda: string
  estado?: string
}

interface InvoiceListProps {
  facturas: Factura[]
}

export default function InvoiceList({ facturas }: InvoiceListProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">
        Mis Facturas Guardadas ({facturas.length})
      </h2>

      {facturas.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">Aún no creaste ninguna factura.</p>
      ) : (
        <div className="grid gap-4">
          {facturas.map((factura) => (
            <div
              key={factura.id}
              className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex flex-wrap items-center justify-between gap-4 hover:border-gray-700 transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-emerald-400">{factura.numero}</span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded uppercase font-semibold">
                    {factura.estado || 'PAGADA'}
                  </span>
                </div>
                <p className="text-sm text-gray-300">
                  <strong>Cliente:</strong> {factura.cliente}
                </p>
                <p className="text-xs text-gray-400">
                  <strong>Concepto:</strong> {factura.concepto}
                </p>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold text-white">
                  {factura.moneda === 'USD' ? '$' : 'ARS $'} {factura.monto.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}