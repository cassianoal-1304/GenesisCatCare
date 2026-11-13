import { formatPrice } from './format'

export interface PlacedOrder {
  id: string
  order_number: number
  created_at: string
  customer: { name: string; phone: string | null; city: string; neighborhood: string; address: string | null; notes: string | null }
  items: { product_name: string; variant_name: string | null; quantity: number; unit_price: number; line_total: number }[]
  subtotal: number
  total: number
}

/** Mensagem do pedido (usa SOMENTE os valores devolvidos pelo banco). */
export function buildOrderMessage(o: PlacedOrder): string {
  const c = o.customer
  const lines = [
    'Olá! Gostaria de finalizar meu pedido.',
    '',
    `*PEDIDO: #${o.order_number}*`,
    '',
    '*CLIENTE:*',
    `Nome: ${c.name}`,
    `Cidade: ${c.city}`,
    `Bairro: ${c.neighborhood}`,
    `Endereço: ${c.address || 'Não informado'}`,
  ]
  if (c.notes) lines.push(`Observações: ${c.notes}`)
  lines.push('', '*PRODUTOS:*')
  o.items.forEach((it, i) => {
    if (i > 0) lines.push('')
    lines.push(`${i + 1}. ${it.product_name}`)
    lines.push(`Quantidade: ${it.quantity}`)
    if (it.variant_name) lines.push(`Variação: ${it.variant_name}`)
    lines.push(`Preço unitário: ${formatPrice(it.unit_price)}`)
    lines.push(`Subtotal: ${formatPrice(it.line_total)}`)
  })
  lines.push('', `*TOTAL DO PEDIDO: ${formatPrice(o.total)}*`, '',
    'Gostaria de confirmar a disponibilidade e combinar o pagamento e a entrega.')
  return lines.join('\n')
}

/** Link wa.me com a mensagem codificada para URL. */
export const whatsappLink = (number: string, text: string) =>
  `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

/** Copia texto para a área de transferência (com alternativa para navegadores antigos). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    let ok = false
    try { ok = document.execCommand('copy') } catch { ok = false }
    ta.remove()
    return ok
  }
}

const LAST_ORDER_KEY = 'store-last-order-v1'
export function saveLastOrder(o: PlacedOrder) {
  try { localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(o)) } catch { /* ignore */ }
}
export function loadLastOrder(): PlacedOrder | null {
  try { return JSON.parse(localStorage.getItem(LAST_ORDER_KEY) ?? 'null') } catch { return null }
}
