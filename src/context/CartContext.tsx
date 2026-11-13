import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Quote } from '../lib/checkout'
import { formatPrice } from '../lib/format'

/**
 * Item do carrinho. Preço e estoque são uma "fotografia" para exibição;
 * os valores oficiais são recalculados no banco ao finalizar o pedido.
 */
export interface CartItem {
  key: string
  productId: string
  variantId: string | null
  slug: string
  name: string
  variantName: string | null
  image: string | null
  unitPrice: number
  maxQuantity: number
  quantity: number
  /** Situação após a última conferência com o banco (ausente = ok). */
  issue?: 'removed' | 'sold_out' | 'unavailable'
}

interface CartState {
  items: CartItem[]
  count: number
  subtotal: number
  isOpen: boolean
  open: () => void
  close: () => void
  add: (item: Omit<CartItem, 'key' | 'quantity'>, quantity: number) => void
  setQuantity: (key: string, quantity: number) => void
  remove: (key: string) => void
  clear: () => void
  /** Atualiza preços/estoque com os dados do banco e devolve avisos das mudanças. */
  applyQuotes: (quotes: Quote[]) => string[]
  /** Há itens que impedem a finalização. */
  hasIssues: boolean
}

const STORAGE_KEY = 'store-cart-v1'
const MAX_QTY = 999
const CartContext = createContext<CartState | null>(null)

const itemKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ''}`
const clamp = (n: number, max: number) => Math.max(1, Math.min(Math.floor(n) || 1, Math.max(1, max), MAX_QTY))

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (i): i is CartItem =>
        i && typeof i.productId === 'string' && typeof i.name === 'string' &&
        typeof i.unitPrice === 'number' && typeof i.quantity === 'number' && i.quantity > 0,
    )
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart)
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch { /* modo privado */ }
  }, [items])

  // Sincroniza entre abas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) setItems(loadCart()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const add = useCallback<CartState['add']>((item, quantity) => {
    const key = itemKey(item.productId, item.variantId)
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key)
      if (existing) {
        return prev.map((i) => i.key === key
          ? { ...i, ...item, issue: undefined, quantity: clamp(i.quantity + quantity, item.maxQuantity) } : i)
      }
      return [...prev, { ...item, key, quantity: clamp(quantity, item.maxQuantity) }]
    })
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: clamp(quantity, i.maxQuantity) } : i)))
  }, [])

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => i.key !== key)), [])

  // Referência ao estado atual para reconciliar de forma síncrona
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items }, [items])

  const applyQuotes = useCallback((quotes: Quote[]) => {
    const notices: string[] = []
    const next = itemsRef.current.map((item): CartItem => {
      const label = item.name + (item.variantName ? ` (${item.variantName})` : '')
      const q = quotes.find((x) => x.product_id === item.productId && (x.variant_id ?? null) === item.variantId)
      if (!q || q.status === 'removed') {
        notices.push(`"${label}" não está mais disponível na loja.`)
        return { ...item, issue: 'removed' }
      }
      if (q.status === 'sold_out' || q.status === 'unavailable') {
        notices.push(`"${label}" está ${q.status === 'sold_out' ? 'esgotado' : 'indisponível no momento'}.`)
        return { ...item, issue: q.status }
      }
      const price = Number(q.unit_price)
      const updated: CartItem = {
        ...item, issue: undefined, name: q.name ?? item.name, variantName: q.variant_name ?? item.variantName,
        slug: q.slug ?? item.slug, image: q.image ?? item.image,
        unitPrice: price, maxQuantity: Math.min(q.stock ?? item.maxQuantity, MAX_QTY),
      }
      if (price !== item.unitPrice) {
        notices.push(`O preço de "${label}" mudou de ${formatPrice(item.unitPrice)} para ${formatPrice(price)}.`)
      }
      if (updated.quantity > updated.maxQuantity) {
        notices.push(`Restam apenas ${updated.maxQuantity} unidade(s) de "${label}". A quantidade foi ajustada.`)
        updated.quantity = updated.maxQuantity
      }
      return updated
    })
    itemsRef.current = next
    setItems(next)
    return notices
  }, [])
  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartState>(() => ({
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: items.reduce((n, i) => n + (i.issue ? 0 : i.quantity * i.unitPrice), 0),
    hasIssues: items.some((i) => i.issue),
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    add, setQuantity, remove, clear, applyQuotes,
  }), [items, isOpen, add, setQuantity, remove, clear, applyQuotes])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>')
  return ctx
}
