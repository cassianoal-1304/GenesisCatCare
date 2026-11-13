import { supabase } from '../supabase'
import type { MovementReason, StockMovement } from '../../types/db'

export interface InventoryVariant { id: string; name: string; stock: number; min_stock: number | null; is_active: boolean; sort_order: number }
export interface InventoryRow {
  id: string
  name: string
  sku: string | null
  stock: number
  min_stock: number
  available_stock: number
  has_variants: boolean
  low_stock: boolean
  is_active: boolean
  is_available: boolean
  category: { name: string } | null
  product_images: { url: string }[]
  product_variants: InventoryVariant[]
}

export type InventoryFilter = '' | 'low' | 'sold_out' | 'available' | 'unavailable'

export async function listInventory(q: { search?: string; categoryId?: string; filter?: InventoryFilter; page: number; pageSize: number }) {
  let query = supabase.from('products')
    .select(`id, name, sku, stock, min_stock, available_stock, has_variants, low_stock, is_active, is_available,
      category:categories(name), product_images(url, sort_order),
      product_variants(id, name, stock, min_stock, is_active, sort_order)`, { count: 'exact' })
    .order('sort_order', { referencedTable: 'product_images' })
    .limit(1, { referencedTable: 'product_images' })
    .order('sort_order', { referencedTable: 'product_variants' })
  const term = q.search?.trim()
  if (term) query = query.ilike('search_text', `%${term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\\%_,()]/g, ' ')}%`)
  if (q.categoryId) query = query.eq('category_id', q.categoryId)
  if (q.filter === 'low') query = query.eq('low_stock', true)
  if (q.filter === 'sold_out') query = query.eq('available_stock', 0)
  if (q.filter === 'available') query = query.gt('available_stock', 0).eq('is_available', true)
  if (q.filter === 'unavailable') query = query.eq('is_available', false)
  const from = q.page * q.pageSize
  const { data, error, count } = await query.order('name').order('id').range(from, from + q.pageSize - 1)
  if (error) throw error
  return { items: (data ?? []) as unknown as InventoryRow[], total: count ?? 0 }
}

export type StockOperation = 'in' | 'out' | 'sale' | 'set'

export async function stockOperation(productId: string, variantId: string | null, type: StockOperation, quantity: number, reason: string) {
  const { data, error } = await supabase.rpc('admin_stock_operation', {
    p_product_id: productId, p_variant_id: variantId, p_type: type, p_quantity: quantity, p_reason: reason,
  })
  if (error) throw error
  return data as { before: number; after: number }
}

/** Estoque mínimo do produto, ou de uma variação (null = usa o do produto). */
export async function setMinStock(productId: string, variantId: string | null, min: number | null) {
  const { error } = variantId
    ? await supabase.from('product_variants').update({ min_stock: min }).eq('id', variantId)
    : await supabase.from('products').update({ min_stock: min ?? 0 }).eq('id', productId)
  if (error) throw error
}

export async function listMovements(q: { productId?: string; reason?: MovementReason | ''; from?: string; to?: string; page: number; pageSize: number }) {
  let query = supabase.from('stock_movements')
    .select('id, quantity_change, stock_before, stock_after, reason, note, created_at, created_by_email, order_id, product:products(name), variant:product_variants(name), order:orders(order_number)', { count: 'exact' })
  if (q.productId) query = query.eq('product_id', q.productId)
  if (q.reason) query = query.eq('reason', q.reason)
  if (q.from) query = query.gte('created_at', new Date(`${q.from}T00:00:00`).toISOString())
  if (q.to) { const d = new Date(`${q.to}T00:00:00`); d.setDate(d.getDate() + 1); query = query.lt('created_at', d.toISOString()) }
  const from = q.page * q.pageSize
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(from, from + q.pageSize - 1)
  if (error) throw error
  return { items: (data ?? []) as unknown as StockMovement[], total: count ?? 0 }
}
