import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getOrder, reverseOrderStock, saveAdminNotes, updateOrderStatus, type ItemStock } from '../../lib/admin/ordersApi'
import { friendlyError } from '../../lib/admin/errors'
import { MOVEMENT_REASON, ORDER_STATUS } from '../../lib/admin/labels'
import { formatDateTime } from '../../lib/admin/text'
import { formatPrice } from '../../lib/format'
import type { OrderDetail, OrderStatus, StockMovement } from '../../types/db'
import { Badge, Card, TextArea } from '../../components/admin/Form'
import { Modal, useConfirm } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { ChevronLeft, WhatsAppIcon } from '../../components/ui/Icons'

const formatPhone = (p: string) => {
  const d = p.startsWith('55') && p.length > 11 ? p.slice(2) : p
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p
}

export default function OrderDetailPage() {
  const { id = '' } = useParams()
  const notify = useToast()
  const confirm = useConfirm()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [stock, setStock] = useState<ItemStock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reverseOnCancel, setReverseOnCancel] = useState(true)
  const [notes, setNotes] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await getOrder(id)
      if (!r.order) { setError('Pedido não encontrado.'); return }
      setOrder(r.order); setMovements(r.movements); setStock(r.stock); setNotes(r.order.admin_notes ?? '')
      document.title = `Pedido #${r.order.order_number} | Painel`
    } catch (e) { setError(friendlyError(e, 'Não foi possível carregar o pedido.')) }
    finally { setLoading(false) }
  }, [id])
  useEffect(() => { load() }, [load])

  if (loading) return <Spinner />
  if (error || !order) return <ErrorState message={error || 'Pedido não encontrado.'} onRetry={load} />

  const stockOf = (itemId: string) => stock.find((s) => s.item_id === itemId)
  const shortages = order.status === 'pending' ? order.order_items.filter((it) => {
    const s = stockOf(it.id)
    return !s || !s.product_exists || (s.available ?? 0) < it.quantity || !s.is_available
  }) : []

  /** Executa a ação no banco; em caso de erro mostra a mensagem e recarrega a situação. */
  const run = async (fn: () => Promise<void>, success: string) => {
    if (busy) return
    setBusy(true); setActionError('')
    try { await fn(); notify(success) }
    catch (e) { setActionError(friendlyError(e, 'Não foi possível concluir a ação.')) }
    finally { await load(); setBusy(false) }
  }

  const changeStatus = async (status: OrderStatus) => {
    if (status === 'confirmed') {
      const ok = await confirm({
        title: `Confirmar pedido #${order.order_number}?`, confirmLabel: 'Confirmar e baixar estoque',
        message: <>As quantidades deste pedido serão <strong>descontadas do estoque</strong> agora. O banco confere a disponibilidade de todos os itens antes de descontar.</>,
      })
      if (!ok) return
      return run(() => updateOrderStatus(order.id, 'confirmed'), `Pedido #${order.order_number} confirmado e estoque atualizado.`)
    }
    return run(() => updateOrderStatus(order.id, status), `Status alterado para “${ORDER_STATUS[status].label}”.`)
  }

  const doCancel = () => {
    setCancelOpen(false)
    run(() => updateOrderStatus(order.id, 'canceled', order.stock_applied && reverseOnCancel),
      order.stock_applied && reverseOnCancel ? 'Pedido cancelado e estoque estornado.' : 'Pedido cancelado.')
  }

  const doReverse = async () => {
    const ok = await confirm({ title: 'Estornar estoque?', confirmLabel: 'Estornar',
      message: <>As unidades do pedido #{order.order_number} voltarão ao estoque. O estorno só pode ser feito uma vez.</> })
    if (ok) run(() => reverseOrderStock(order.id), 'Estoque estornado.')
  }

  const s = order.status
  const actions: { label: string; status: OrderStatus; primary?: boolean }[] =
    s === 'pending' ? [{ label: 'Confirmar pedido', status: 'confirmed', primary: true }]
      : s === 'confirmed' ? [{ label: 'Em preparação', status: 'preparing', primary: true }, { label: 'Finalizar', status: 'completed' }]
        : s === 'preparing' ? [{ label: 'Finalizar pedido', status: 'completed', primary: true }] : []
  const canCancel = s !== 'canceled'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/admin/pedidos" aria-label="Voltar para pedidos" className="grid size-10 place-items-center rounded-full hover:bg-ink-100"><ChevronLeft /></Link>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Pedido #{order.order_number}</h1>
            <p className="text-sm text-ink-500">Recebido em {formatDateTime(order.created_at)}</p>
          </div>
        </div>
        <Badge tone={ORDER_STATUS[s].tone}>{ORDER_STATUS[s].label}</Badge>
      </div>

      {/* Ações */}
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((a) => (
            <button key={a.status} disabled={busy || (a.status === 'confirmed' && shortages.length > 0)} onClick={() => changeStatus(a.status)}
              className={a.primary ? 'btn-primary h-11' : 'btn-secondary'}>{busy ? 'Aguarde...' : a.label}</button>
          ))}
          {canCancel && <button disabled={busy} onClick={() => { setReverseOnCancel(true); setCancelOpen(true) }} className="btn-secondary hover:!border-red-200 hover:!bg-red-50 hover:!text-red-700">Cancelar pedido</button>}
          {s === 'canceled' && order.stock_applied && <button disabled={busy} onClick={doReverse} className="btn-primary h-11">Estornar estoque</button>}
        </div>
        <p className="mt-3 text-sm text-ink-500">
          {order.stock_applied
            ? `Estoque descontado${order.confirmed_at ? ` em ${formatDateTime(order.confirmed_at)}` : ''}.${s === 'canceled' ? ' O pedido foi cancelado, mas as unidades ainda não voltaram ao estoque.' : ''}`
            : order.stock_reversed_at ? `Estoque estornado em ${formatDateTime(order.stock_reversed_at)}.`
              : s === 'pending' ? 'O estoque não está reservado: ele só é descontado quando o pedido for confirmado.'
                : 'Este pedido não movimentou o estoque.'}
        </p>
        {shortages.length > 0 && (
          <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Estoque insuficiente para confirmar. Ajuste antes:</p>
            <ul className="mt-1 list-disc pl-5">
              {shortages.map((it) => {
                const st = stockOf(it.id)
                return <li key={it.id}>{it.product_name}{it.variant_name && ` (${it.variant_name})`}: {!st?.product_exists ? 'produto excluído' : !st.is_available ? 'marcado como indisponível' : `disponível ${st.available}, pedido ${it.quantity}`}</li>
              })}
            </ul>
            <Link to="/admin/estoque" className="mt-2 inline-block font-semibold underline">Ir para o estoque</Link>
          </div>
        )}
        {actionError && <p role="alert" className="mt-3 whitespace-pre-line rounded-xl bg-red-50 p-3 text-sm text-red-800">{actionError}</p>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="Produtos">
          <ul className="-my-2 divide-y divide-ink-100">
            {order.order_items.map((it) => {
              const st = stockOf(it.id)
              const short = shortages.includes(it)
              return (
                <li key={it.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{it.product_name}</p>
                    {it.variant_name && <p className="text-ink-500">Variação: {it.variant_name}</p>}
                    <p className="text-ink-500">{it.quantity} × {formatPrice(it.unit_price)}{it.sku && ` · SKU ${it.sku}`}</p>
                    {s === 'pending' && st && (
                      <p className={`mt-0.5 text-xs font-medium ${short ? 'text-red-600' : 'text-emerald-700'}`}>
                        {st.product_exists ? `Em estoque agora: ${st.available}` : 'Produto/opção excluído'}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatPrice(it.line_total)}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-ink-100 pt-3">
            <span className="font-semibold">Total</span><span className="text-xl font-bold tabular-nums">{formatPrice(order.total)}</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">Preços registrados no momento do pedido.</p>
        </Card>

        <div className="space-y-6">
          <Card title="Cliente">
            <dl className="space-y-2 text-sm">
              {([['Nome', order.customer_name], ['Telefone', order.customer_phone ? formatPhone(order.customer_phone) : 'Não informado'],
                ['Cidade', order.customer_city], ['Bairro', order.customer_neighborhood], ['Endereço', order.delivery_address || 'Não informado'],
                ['Observações', order.customer_notes]] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-ink-500">{k}</dt><dd className="whitespace-pre-line break-words font-medium">{v}</dd></div>
              ))}
            </dl>
            {order.customer_phone && (
              <a href={`https://wa.me/${order.customer_phone}?text=${encodeURIComponent(`Olá, ${order.customer_name}! Sobre o seu pedido #${order.order_number}...`)}`}
                target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4 w-full"><WhatsAppIcon width={18} height={18} /> Conversar no WhatsApp</a>
            )}
          </Card>
          <Card title="Anotações internas">
            <TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} aria-label="Anotações internas" placeholder="Forma de pagamento, frete combinado..." />
            <button disabled={notesSaving || notes === (order.admin_notes ?? '')} className="btn-secondary mt-2 h-10 text-sm"
              onClick={async () => {
                setNotesSaving(true)
                try { await saveAdminNotes(order.id, notes); notify('Anotações salvas.'); await load() } catch (e) { notify(friendlyError(e), 'error') }
                finally { setNotesSaving(false) }
              }}>{notesSaving ? 'Salvando...' : 'Salvar anotações'}</button>
          </Card>
        </div>
      </div>

      <Card title="Movimentações de estoque deste pedido">
        {movements.length === 0 ? <p className="text-sm text-ink-500">Nenhuma movimentação.</p> : (
          <ul className="-my-2 divide-y divide-ink-100 text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{m.product?.name ?? 'Produto excluído'}{m.variant && <span className="font-normal text-ink-500"> · {m.variant.name}</span>}</p>
                  <p className="text-xs text-ink-500">{MOVEMENT_REASON[m.reason]} · {formatDateTime(m.created_at)}{m.created_by_email && ` · ${m.created_by_email}`}</p>
                </div>
                <span className="shrink-0 text-right tabular-nums">
                  <span className={`block font-semibold ${m.quantity_change > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</span>
                  <span className="text-xs text-ink-500">{m.stock_before ?? '?'} → {m.stock_after}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {cancelOpen && (
        <Modal title={`Cancelar pedido #${order.order_number}?`} onClose={() => setCancelOpen(false)} footer={
          <>
            <button className="btn-secondary" onClick={() => setCancelOpen(false)}>Voltar</button>
            <button className="btn-primary h-11 !bg-red-600" onClick={doCancel}>Cancelar pedido</button>
          </>
        }>
          {order.stock_applied ? (
            <div className="space-y-3 text-sm">
              <p>O estoque deste pedido <strong>já foi descontado</strong>.</p>
              <label className="flex items-start gap-2.5">
                <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={reverseOnCancel} onChange={(e) => setReverseOnCancel(e.target.checked)} />
                <span><strong>Devolver as unidades ao estoque (estorno)</strong><span className="block text-ink-500">Desmarque se os produtos não voltarão para venda (ex.: avariados). O estorno poderá ser feito depois.</span></span>
              </label>
            </div>
          ) : <p className="text-sm">O estoque não foi descontado, então nenhuma quantidade será alterada.</p>}
        </Modal>
      )}
    </div>
  )
}
