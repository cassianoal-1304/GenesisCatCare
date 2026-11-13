import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listOrders } from '../../lib/admin/ordersApi'
import { friendlyError } from '../../lib/admin/errors'
import { ORDER_STATUS } from '../../lib/admin/labels'
import { formatDateTime } from '../../lib/admin/text'
import { formatPrice } from '../../lib/format'
import type { Order, OrderStatus } from '../../types/db'
import { Badge, PageHeader, Select, TextInput } from '../../components/admin/Form'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { ChevronLeft, ChevronRight, SearchIcon } from '../../components/ui/Icons'

const PAGE_SIZE = 20

export default function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as OrderStatus | ''
  const from = params.get('de') ?? ''
  const to = params.get('ate') ?? ''
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1)

  const [searchInput, setSearchInput] = useState(search)
  const [items, setItems] = useState<Order[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { document.title = 'Pedidos | Painel' }, [])

  const update = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('pagina' in changes)) next.delete('pagina')
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (searchInput === search) return
    const t = setTimeout(() => update({ q: searchInput.trim() }), 350)
    return () => clearTimeout(t)
  }, [searchInput, search, update])

  const load = useCallback(() => {
    setLoading(true); setError('')
    listOrders({ search, status, from, to, page, pageSize: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total) })
      .catch((e) => setError(friendlyError(e, 'Não foi possível carregar os pedidos.')))
      .finally(() => setLoading(false))
  }, [search, status, from, to, page])
  useEffect(load, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(search || status || from || to)

  return (
    <>
      <PageHeader title="Pedidos" description={loading ? ' ' : `${total} pedido${total === 1 ? '' : 's'}`} />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <SearchIcon width={17} height={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <TextInput type="search" placeholder="Número, cliente, telefone ou cidade" aria-label="Buscar pedidos"
            value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Todos os status</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-500">De
          <TextInput type="date" aria-label="Data inicial" value={from} max={to || undefined} onChange={(e) => update({ de: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-500">Até
          <TextInput type="date" aria-label="Data final" value={to} min={from || undefined} onChange={(e) => update({ ate: e.target.value })} />
        </label>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !loading && items.length === 0 ? (
        hasFilters
          ? <EmptyState title="Nenhum pedido encontrado" action={<button className="btn-secondary" onClick={() => { setSearchInput(''); setParams({}) }}>Limpar filtros</button>}>Ajuste a busca ou os filtros.</EmptyState>
          : <EmptyState title="Nenhum pedido ainda">Os pedidos feitos pela loja aparecem aqui, com status “Aguardando confirmação”.</EmptyState>
      ) : (
        <div className={`overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 ${loading ? 'opacity-60' : ''}`}>
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-ink-100 bg-ink-50 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-3">Pedido</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Data</th><th className="px-3 py-3 text-right">Total</th><th className="px-4 py-3">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((o) => (
                <tr key={o.id} className="cursor-pointer hover:bg-ink-50/60">
                  <td className="px-4 py-3 font-semibold"><Link to={`/admin/pedidos/${o.id}`} className="hover:underline">#{o.order_number}</Link></td>
                  <td className="px-3 py-3"><Link to={`/admin/pedidos/${o.id}`} className="block">
                    <span className="font-medium">{o.customer_name}</span>
                    <span className="block text-xs text-ink-500">{[o.customer_neighborhood, o.customer_city].filter(Boolean).join(' · ')}</span></Link></td>
                  <td className="px-3 py-3 text-ink-500">{formatDateTime(o.created_at)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPrice(o.total)}</td>
                  <td className="px-4 py-3"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-ink-100 md:hidden">
            {items.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/pedidos/${o.id}`} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">#{o.order_number} <span className="font-normal">· {o.customer_name}</span></p>
                    <p className="text-xs text-ink-500">{formatDateTime(o.created_at)} · {o.customer_city}</p>
                    <div className="mt-1.5"><Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge></div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatPrice(o.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary h-10 px-3" disabled={page === 0} onClick={() => update({ pagina: String(page) })} aria-label="Página anterior"><ChevronLeft width={18} height={18} /></button>
          <span className="tabular-nums text-ink-500">Página {page + 1} de {pages}</span>
          <button className="btn-secondary h-10 px-3" disabled={page + 1 >= pages} onClick={() => update({ pagina: String(page + 2) })} aria-label="Próxima página"><ChevronRight width={18} height={18} /></button>
        </div>
      )}
    </>
  )
}
