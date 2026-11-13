import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { useCartValidation } from '../../hooks/useCartValidation'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { formatPrice } from '../../lib/format'
import { CartLines, Notices } from '../../components/store/CartLines'
import { EmptyState } from '../../components/ui/Feedback'
import { BagIcon } from '../../components/ui/Icons'

export default function CartPage() {
  useDocumentTitle('Carrinho')
  const { items, count, subtotal, hasIssues } = useCart()
  const { checking, notices, error } = useCartValidation()

  if (items.length === 0) {
    return (
      <EmptyState icon={<BagIcon width={28} height={28} />} title="Seu carrinho está vazio"
        action={<Link to="/catalogo" className="btn-primary">Ver produtos</Link>}>
        Explore o catálogo e adicione seus produtos favoritos.
      </EmptyState>
    )
  }

  return (
    <div className="container-page py-6 sm:py-10">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Carrinho</h1>
      <p className="mt-1 text-sm text-ink-500">{count} {count === 1 ? 'item' : 'itens'}</p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <Notices notices={notices} />
          {error && <p role="alert" className="mb-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <div className="rounded-2xl bg-white px-4 ring-1 ring-ink-100 sm:px-6"><CartLines /></div>
          <Link to="/catalogo" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">← Continuar comprando</Link>
        </div>

        <aside className="h-fit rounded-2xl bg-white p-5 ring-1 ring-ink-100 lg:sticky lg:top-24">
          <h2 className="font-semibold">Resumo</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {items.filter((i) => !i.issue).map((i) => (
              <div key={i.key} className="flex justify-between gap-3">
                <dt className="min-w-0 truncate text-ink-500">{i.quantity}× {i.name}{i.variantName && ` (${i.variantName})`}</dt>
                <dd className="shrink-0 tabular-nums">{formatPrice(i.unitPrice * i.quantity)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-ink-100 pt-4">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">Frete e forma de pagamento são combinados pelo WhatsApp.</p>
          {hasIssues && <p className="mt-3 text-sm font-medium text-red-600">Remova os itens indisponíveis para continuar.</p>}
          {hasIssues || checking ? (
            <button disabled className="btn-primary mt-4 w-full">{checking ? 'Conferindo estoque...' : 'Finalizar pedido'}</button>
          ) : (
            <Link to="/checkout" className="btn-primary mt-4 w-full">Finalizar pedido</Link>
          )}
        </aside>
      </div>
    </div>
  )
}
