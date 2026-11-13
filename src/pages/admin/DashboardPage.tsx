import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getDashboard } from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { formatDateTime } from '../../lib/admin/text'
import { formatPrice } from '../../lib/format'
import type { DashboardStats, Order, StockMovement } from '../../types/db'
import { MOVEMENT_REASON, ORDER_STATUS } from '../../lib/admin/labels'
import { Badge, Card, PageHeader } from '../../components/admin/Form'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { PlusIcon } from '../../components/ui/Icons'

function Stat({ label, value, to, tone }: { label: string; value: number; to: string; tone?: 'red' | 'amber' | 'accent' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'accent' ? 'text-accent' : 'text-ink-900'
  return (
    <Link to={to} className="rounded-2xl bg-white p-4 ring-1 ring-ink-100 transition hover:ring-ink-300 sm:p-5">
      <p className="text-xs font-medium text-ink-500 sm:text-sm">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${color}`}>{value}</p>
    </Link>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<{ stats: DashboardStats; orders: Order[]; movements: StockMovement[] } | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    getDashboard().then(setData).catch((e) => setError(friendlyError(e, 'Não foi possível carregar o painel.')))
  }, [])
  useEffect(() => { document.title = 'Painel'; load() }, [load])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return <Spinner />
  const { stats, orders, movements } = data

  return (
    <>
      <PageHeader title="Painel" description="Resumo da sua loja"
        actions={<Link to="/admin/produtos/novo" className="btn-primary h-11"><PlusIcon width={18} height={18} /> Novo produto</Link>} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Produtos cadastrados" value={stats.total} to="/admin/produtos" />
        <Stat label="Disponíveis" value={stats.available} to="/admin/produtos?estoque=available" />
        <Stat label="Esgotados" value={stats.sold_out} to="/admin/produtos?estoque=sold_out" tone={stats.sold_out ? 'red' : undefined} />
        <Stat label="Estoque baixo" value={stats.low_stock} to="/admin/produtos?estoque=low" tone={stats.low_stock ? 'amber' : undefined} />
        <Stat label="Em promoção" value={stats.on_sale} to="/admin/produtos?estoque=on_sale" tone="accent" />
        <Stat label="Rascunhos" value={stats.drafts} to="/admin/produtos?status=draft" />
      </div>

      {stats.total === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-ink-300 bg-white p-6 text-center">
          <p className="font-semibold">Comece cadastrando seus produtos</p>
          <p className="mt-1 text-sm text-ink-500">
            {stats.categories === 0 ? 'Crie as categorias e depois cadastre os produtos, ou importe uma planilha CSV.' : 'Cadastre manualmente ou importe uma planilha CSV.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {stats.categories === 0 && <Link to="/admin/categorias" className="btn-secondary">Criar categorias</Link>}
            <Link to="/admin/produtos/novo" className="btn-primary h-11">Cadastrar produto</Link>
            <Link to="/admin/importar" className="btn-secondary">Importar CSV</Link>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Pedidos recentes" description={stats.pending_orders ? `${stats.pending_orders} aguardando confirmação` : undefined}
          actions={<Link to="/admin/pedidos" className="text-sm font-semibold text-brand hover:underline">Ver todos</Link>}>
          {orders.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">Nenhum pedido recebido ainda.</p> : (
            <ul className="-my-2 divide-y divide-ink-100">
              {orders.map((o) => (
                <li key={o.id}><Link to={`/admin/pedidos/${o.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 text-sm hover:bg-ink-50">
                  <div className="min-w-0">
                    <p className="font-medium">#{o.order_number} · <span className="font-normal">{o.customer_name}</span></p>
                    <p className="text-xs text-ink-500">{formatDateTime(o.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{formatPrice(o.total)}</span>
                    <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  </div>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Movimentações de estoque recentes" actions={<Link to="/admin/estoque/movimentacoes" className="text-sm font-semibold text-brand hover:underline">Ver todas</Link>}>
          {movements.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">Nenhuma movimentação registrada.</p> : (
            <ul className="-my-2 divide-y divide-ink-100">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.product?.name ?? 'Produto excluído'}{m.variant && <span className="font-normal text-ink-500"> · {m.variant.name}</span>}</p>
                    <p className="truncate text-xs text-ink-500">
                      {MOVEMENT_REASON[m.reason]}{m.order && ` #${m.order.order_number}`}{m.note && ` · ${m.note}`} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-semibold tabular-nums ${m.quantity_change > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {m.quantity_change > 0 ? '+' : ''}{m.quantity_change}
                    </p>
                    <p className="text-xs text-ink-500">saldo {m.stock_after}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
