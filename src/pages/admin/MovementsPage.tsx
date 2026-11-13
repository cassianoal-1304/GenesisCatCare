import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { friendlyError } from '../../lib/admin/errors'
import { MOVEMENT_REASON } from '../../lib/admin/labels'
import { listMovements } from '../../lib/admin/stockApi'
import { formatDateTime } from '../../lib/admin/text'
import { supabase } from '../../lib/supabase'
import type { MovementReason, StockMovement } from '../../types/db'
import { PageHeader, Select, TextInput } from '../../components/admin/Form'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { ChevronLeft, ChevronRight, CloseIcon } from '../../components/ui/Icons'

const PAGE_SIZE = 30

export default function MovementsPage() {
  const [params, setParams] = useSearchParams()
  const productId = params.get('produto') ?? ''
  const reason = (params.get('tipo') ?? '') as MovementReason | ''
  const from = params.get('de') ?? ''
  const to = params.get('ate') ?? ''
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1)

  const [items, setItems] = useState<StockMovement[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [productName, setProductName] = useState('')

  useEffect(() => { document.title = 'Movimentações | Painel' }, [])
  useEffect(() => {
    if (!productId) { setProductName(''); return }
    supabase.from('products').select('name').eq('id', productId).maybeSingle().then(({ data }) => setProductName(data?.name ?? 'Produto'))
  }, [productId])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('pagina' in changes)) next.delete('pagina')
    setParams(next, { replace: true })
  }

  const load = useCallback(() => {
    setLoading(true); setError('')
    listMovements({ productId, reason, from, to, page, pageSize: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total) })
      .catch((e) => setError(friendlyError(e, 'Não foi possível carregar as movimentações.')))
      .finally(() => setLoading(false))
  }, [productId, reason, from, to, page])
  useEffect(load, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader title="Movimentações de estoque" description={loading ? ' ' : `${total} registro${total === 1 ? '' : 's'}`}
        actions={<Link to="/admin/estoque" className="btn-secondary">Voltar ao estoque</Link>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {productId && (
          <span className="inline-flex h-11 items-center gap-1 rounded-full bg-brand/10 pl-4 pr-1.5 text-sm font-medium text-brand">
            {productName}
            <button onClick={() => update({ produto: '' })} aria-label="Remover filtro de produto" className="grid size-8 place-items-center rounded-full hover:bg-brand/15"><CloseIcon width={15} height={15} /></button>
          </span>
        )}
        <Select aria-label="Tipo" value={reason} onChange={(e) => update({ tipo: e.target.value })} className="!w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(MOVEMENT_REASON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-500">De <TextInput type="date" aria-label="Data inicial" value={from} onChange={(e) => update({ de: e.target.value })} className="!w-auto" /></label>
        <label className="flex items-center gap-2 text-sm text-ink-500">Até <TextInput type="date" aria-label="Data final" value={to} onChange={(e) => update({ ate: e.target.value })} className="!w-auto" /></label>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !loading && items.length === 0 ? (
        <EmptyState title="Nenhuma movimentação encontrada">Ajuste os filtros.</EmptyState>
      ) : (
        <div className={`overflow-x-auto rounded-2xl bg-white ring-1 ring-ink-100 ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-ink-100 bg-ink-50 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-4 py-3">Data</th><th className="px-3 py-3">Produto</th><th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3 text-right">Qtd.</th><th className="px-3 py-3 text-right">Antes → Depois</th>
                <th className="px-3 py-3">Motivo</th><th className="px-3 py-3">Responsável</th><th className="px-4 py-3">Pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{formatDateTime(m.created_at)}</td>
                  <td className="px-3 py-2.5"><span className="font-medium">{m.product?.name ?? 'Produto excluído'}</span>{m.variant && <span className="block text-xs text-ink-500">{m.variant.name}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{MOVEMENT_REASON[m.reason] ?? m.reason}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${m.quantity_change > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-500">{m.stock_before ?? '?'} → <strong className="text-ink-900">{m.stock_after}</strong></td>
                  <td className="max-w-[220px] px-3 py-2.5 text-ink-700">{m.note || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-ink-500">{m.created_by_email ?? 'Sistema'}</td>
                  <td className="px-4 py-2.5">{m.order && m.order_id ? <Link to={`/admin/pedidos/${m.order_id}`} className="font-medium text-brand hover:underline">#{m.order.order_number}</Link> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
