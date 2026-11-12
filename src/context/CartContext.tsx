import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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
          ? { ...i, ...item, quantity: clamp(i.quantity + quantity, item.maxQuantity) } : i)
      }
      return [...prev, { ...item, key, quantity: clamp(quantity, item.maxQuantity) }]
    })
  }, [])

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: clamp(quantity, i.maxQuantity) } : i)))
  }, [])

  const remove = useCallback((key: string) => setItems((prev) => prev.filter((i) => i.key !== key)), [])
  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartState>(() => ({
    items,
    count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal: items.reduce((n, i) => n + i.quantity * i.unitPrice, 0),
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    add, setQuantity, remove, clear,
  }), [items, isOpen, add, setQuantity, remove, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>')
  return ctx
}
