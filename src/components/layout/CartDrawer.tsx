import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../lib/format'
import { ProductImage } from '../store/ProductImage'
import { BagIcon, CloseIcon, TrashIcon } from '../ui/Icons'
import { QuantityInput } from '../ui/QuantityInput'

export function CartDrawer() {
  const { items, isOpen, close, setQuantity, remove, subtotal, count } = useCart()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Carrinho">
      <div className="absolute inset-0 animate-fade-in bg-ink-900/40" onClick={close} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md animate-slide-in flex-col bg-cream shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-ink-100 px-5">
          <h2 className="font-display text-lg font-semibold">Seu carrinho {count > 0 && <span className="text-ink-400">({count})</span>}</h2>
          <button onClick={close} aria-label="Fechar carrinho" className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><CloseIcon /></button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-brand/8 text-brand"><BagIcon width={28} height={28} /></div>
            <p className="mt-4 font-medium">Seu carrinho está vazio</p>
            <p className="mt-1 text-sm text-ink-500">Explore o catálogo e adicione seus produtos favoritos.</p>
            <Link to="/catalogo" onClick={close} className="btn-primary mt-6">Ver produtos</Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-ink-100 overflow-y-auto px-5">
              {items.map((item) => (
                <li key={item.key} className="flex gap-4 py-4">
                  <Link to={`/produto/${item.slug}`} onClick={close} className="shrink-0">
                    <ProductImage src={item.image} alt={item.name} className="size-20 rounded-xl" />
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link to={`/produto/${item.slug}`} onClick={close} className="line-clamp-2 text-sm font-medium hover:underline">{item.name}</Link>
                        {item.variantName && <p className="mt-0.5 text-xs text-ink-500">{item.variantName}</p>}
                      </div>
                      <button onClick={() => remove(item.key)} aria-label={`Remover ${item.name}`}
                        className="-mr-2 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-red-600">
                        <TrashIcon width={17} height={17} />
                      </button>
                    </div>
                    <div className="mt-auto flex items-end justify-between pt-2">
                      <QuantityInput size="sm" value={item.quantity} max={item.maxQuantity} onChange={(n) => setQuantity(item.key, n)} />
                      <span className="text-sm font-semibold tabular-nums">{formatPrice(item.unitPrice * item.quantity)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-500">Subtotal</span>
                <span className="text-lg font-bold tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <p className="mt-1 text-xs text-ink-400">Valores e disponibilidade são confirmados ao finalizar o pedido.</p>
              <button onClick={close} className="btn-secondary mt-4 w-full">Continuar comprando</button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
