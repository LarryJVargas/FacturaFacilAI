// Interfaz del tipo Factura
interface Factura {
  id: string
  numero: string
  cliente: string
  concepto: string
  monto: number
  moneda: string
  dias_vencimiento: number
  estado: string
  created_at?: string
}

// Función para generar el link de WhatsApp con el mensaje personalizado
const getWhatsAppUrl = (factura: Factura) => {
  const mensaje = `Hola ${factura.cliente}, te envío la factura *${factura.numero}* por un total de *${factura.moneda} ${factura.monto}* en concepto de: "${factura.concepto}". Vence en ${factura.dias_vencimiento} días.`
  
  return `https://wa.me/?text=${encodeURIComponent(mensaje)}`
}