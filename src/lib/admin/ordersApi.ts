import { supabase } from '../supabase'
import type { Order, OrderDetail, OrderStatus, StockMovement } from '../../types/db'

export interface OrderQuery {
  search?: string
  status?: OrderStatus | ''
  from?: string   // AAAA-MM-DD
  to?: string     // AAAA-MM-DD (inclusive)
  page: number
  pageSize: number
}

/** Converte uma data local (AAAA-MM-DD) para o início do dia em ISO. */
const startOfDay = (d: string) => new Date(`${d}T00:00:00`).toISOString()
const nextDay = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + 1); return x.toISOString() }

export async function listOrders(q: OrderQuery) {
  let query = supabase.from('orders')
    .select('id, order_number, status, customer_name, customer_phone, customer_city, customer_neighborhood, total, stock_applied, created_at', { count: 'exact' })
  const term = q.search?.trim().replace(/^#/, '')
  if (term) {
    const t = term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\\%_,()]/g, ' ')
    query = query.ilike('search_text', `%${t}%`)
  }
  if (q.status) query = query.eq('status', q.status)
  if (q.from) query = query.gte('created_at', startOfDay(q.from))
  if (q.to) query = query.lt('created_at', nextDay(q.to))
  const from = q.page * q.pageSize
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id').range(from, from + q.pageSize - 1)
  if (error) throw error
  return { items: (data ?? []) as Order[], total: count ?? 0 }
}

export interface ItemStock { item_id: string; quantity: number; available: number | null; product_exists: boolean; is_available: boolean }

export async function getOrder(id: string) {
  const [order, movements, stock] = await Promise.all([
    supabase.from('orders')
      .select('*, order_items(id, product_id, variant_id, product_name, variant_name, sku, unit_price, quantity, line_total, created_at)')
      .eq('id', id).order('created_at', { referencedTable: 'order_items' }).maybeSingle(),
    supabase.from('stock_movements')
      .select('id, quantity_change, stock_before, stock_after, reason, note, created_at, created_by_email, order_id, product:products(name), variant:product_variants(name), order:orders(order_number)')
      .eq('order_id', id).order('created_at'),
    supabase.rpc('admin_check_order_stock', { p_order_id: id }),
  ])
  if (order.error) throw order.error
  if (movements.error) throw movements.error
  if (stock.error) throw stock.error
  return {
    order: order.data as unknown as OrderDetail | null,
    movements: (movements.data ?? []) as unknown as StockMovement[],
    stock: (stock.data ?? []) as ItemStock[],
  }
}

/** Altera o status no banco (a baixa/estorno de estoque é feita na mesma transação). */
export async function updateOrderStatus(id: string, status: OrderStatus, reverseStock = false) {
  const { error } = await supabase.rpc('admin_update_order_status', { p_order_id: id, p_status: status, p_reverse_stock: reverseStock })
  if (error) throw error
}

export async function reverseOrderStock(id: string) {
  const { error } = await supabase.rpc('admin_reverse_order_stock', { p_order_id: id })
  if (error) throw error
}

export async function saveAdminNotes(id: string, notes: string) {
  const { error } = await supabase.from('orders').update({ admin_notes: notes.trim() || null }).eq('id', id)
  if (error) throw error
}
