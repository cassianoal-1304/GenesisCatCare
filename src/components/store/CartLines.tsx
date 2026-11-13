import { Link } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { formatPrice } from '../../lib/format'
import { TrashIcon } from '../ui/Icons'
import { QuantityInput } from '../ui/QuantityInput'
import { ProductImage } from './ProductImage'

const ISSUE_LABEL = { removed: 'Não está mais disponível', sold_out: 'Esgotado', unavailable: 'Indisponível no momento' }

/** Lista de itens do carrinho (usada na página do carrinho). */
export function CartLines() {
  const { items, setQuantity, remove } = useCart()
  return (
    <ul className="divide-y divide-ink-100">
      {items.map((item) => (
        <li key={item.key} className={`flex gap-3 py-4 sm:gap-4 ${item.issue ? 'opacity-90' : ''}`}>
          <Link to={`/produto/${item.slug}`} className="shrink-0">
            <ProductImage src={item.image} alt={item.name} className={`size-20 rounded-xl sm:size-24 ${item.issue ? 'grayscale' : ''}`} />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/produto/${item.slug}`} className="line-clamp-2 font-medium hover:underline">{item.name}</Link>
                {item.variantName && <p className="mt-0.5 text-sm text-ink-500">Variação: {item.variantName}</p>}
                <p className="mt-0.5 text-sm text-ink-500">{formatPrice(item.unitPrice)} cada</p>
                {item.issue && <p className="mt-1 text-sm font-medium text-red-600">{ISSUE_LABEL[item.issue]} — remova para continuar</p>}
              </div>
              <button onClick={() => remove(item.key)} aria-label={`Remover ${item.name}`}
                className="-mr-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-red-600">
                <TrashIcon width={18} height={18} />
              </button>
            </div>
            <div className="mt-auto flex items-end justify-between gap-2 pt-3">
              <QuantityInput size="sm" value={item.quantity} max={item.maxQuantity} disabled={Boolean(item.issue)} onChange={(n) => setQuantity(item.key, n)} />
              <span className="text-right">
                <span className="block text-[11px] text-ink-400">Subtotal</span>
                <span className="font-semibold tabular-nums">{item.issue ? '—' : formatPrice(item.unitPrice * item.quantity)}</span>
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function Notices({ notices }: { notices: string[] }) {
  if (!notices.length) return null
  return (
    <div role="status" className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Seu carrinho foi atualizado com os dados atuais da loja:</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">{notices.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  )
}
