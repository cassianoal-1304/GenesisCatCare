import { supabase } from './supabase'
import type { PlacedOrder } from './whatsapp'

export type QuoteStatus = 'ok' | 'sold_out' | 'unavailable' | 'removed'
export interface Quote {
  product_id: string
  variant_id: string | null
  name?: string
  variant_name?: string | null
  slug?: string
  image?: string | null
  unit_price?: number
  stock?: number
  status: QuoteStatus
}

/** Preços e estoque atuais, direto do banco. */
export async function quoteCart(items: { productId: string; variantId: string | null }[]): Promise<Quote[]> {
  if (items.length === 0) return []
  const { data, error } = await supabase.rpc('quote_cart', {
    p_items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId })),
  })
  if (error) throw error
  return data as Quote[]
}

export interface CustomerData {
  name: string
  phone: string
  city: string
  neighborhood: string
  address: string
  notes: string
}

/** Registra o pedido. O banco recalcula preços e confere a disponibilidade. */
export async function createOrder(customer: CustomerData, items: { productId: string; variantId: string | null; quantity: number }[]) {
  const { data, error } = await supabase.rpc('create_order', {
    p_customer: customer,
    p_items: items.map((i) => ({ product_id: i.productId, variant_id: i.variantId, quantity: i.quantity })),
  })
  if (error) throw error
  return data as PlacedOrder
}
