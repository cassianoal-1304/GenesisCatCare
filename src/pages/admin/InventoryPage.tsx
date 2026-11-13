import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listAllCategories, type AdminCategory } from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { listInventory, setMinStock, stockOperation, type InventoryFilter, type InventoryRow, type StockOperation } from '../../lib/admin/stockApi'
import { parseIntSafe } from '../../lib/admin/text'
import { Badge, Field, PageHeader, Select, TextInput } from '../../components/admin/Form'
import { Modal } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { ProductImage } from '../../components/store/ProductImage'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { ChevronLeft, ChevronRight, SearchIcon } from '../../components/ui/Icons'

const PAGE_SIZE = 20

function StatusBadge({ stock, min, available }: { stock: number; min: number; available: boolean }) {
  if (!available) return <Badge tone="gray">Indisponível</Badge>
  if (stock <= 0) return <Badge tone="red">Esgotado</Badge>
  if (min > 0 && stock <= min) return <Badge tone="amber">Estoque baixo</Badge>
  return <Badge tone="green">Disponível</Badge>
}

interface Target {
  productId: string
  variantId: string | null
  label: string
  stock: number
  min: number | null        // mínimo próprio (variação pode ser null)
  productMin: number
  mode: 'move' | 'min'
}

const OPS: { value: StockOperation; label: string; help: string }[] = [
  { value: 'in', label: 'Adicionar', help: 'Entrada de mercadoria (compra, devolução de fornecedor...)' },
  { value: 'out', label: 'Retirar', help: 'Saída sem venda: perda, avaria, uso interno, brinde...' },
  { value: 'sale', label: 'Registrar venda', help: 'Venda feita fora do site (balcão, telefone...)' },
  { value: 'set', label: 'Ajustar quantidade', help: 'Define o estoque exato (ex.: após contagem/inventário)' },
]

function StockModal({ target, onClose, onDone }: { target: Target; onClose: () => void; onDone: () => void }) {
  const notify = useToast()
  const [mode, setMode] = useState(target.mode)
  const [op, setOp] = useState<StockOperation>('in')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [min, setMin] = useState(target.min == null ? '' : String(target.min))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const n = parseIntSafe(qty)
  const valid = n != null && !Number.isNaN(n)
  const after = !valid ? null : op === 'in' ? target.stock + n : op === 'set' ? n : target.stock - n

  const submitMove = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!valid || (op !== 'set' && n === 0)) return setError('Informe uma quantidade válida.')
    if (after! < 0) return setError(`Estoque insuficiente: há ${target.stock} unidade(s).`)
    if (after === target.stock) return setError('A quantidade final é igual ao estoque atual.')
    if ((op === 'out' || op === 'set') && !reason.trim()) return setError('Informe o motivo.')
    setSaving(true)
    try {
      const r = await stockOperation(target.productId, target.variantId, op, n!, reason.trim())
      notify(`Estoque de ${target.label}: ${r.before} → ${r.after}`)
      onDone()
    } catch (err) { setError(friendlyError(err)) } finally { setSaving(false) }
  }

  const submitMin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    const m = parseIntSafe(min)
    if (Number.isNaN(m) || (m == null && !target.variantId)) return setError('Informe um número inteiro (0 = sem alerta).')
    setSaving(true)
    try { await setMinStock(target.productId, target.variantId, m); notify('Estoque mínimo atualizado.'); onDone() }
    catch (err) { setError(friendlyError(err)) } finally { setSaving(false) }
  }

  return (
    <Modal title={target.label} onClose={onClose} footer={
      <>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="submit" form="stock-form" disabled={saving} className="btn-primary h-11">{saving ? 'Salvando...' : mode === 'move' ? 'Registrar movimentação' : 'Salvar'}</button>
      </>
    }>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 text-sm font-medium">
        {(['move', 'min'] as const).map((m) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError('') }}
            className={`rounded-lg py-2 ${mode === m ? 'bg-white shadow-sm' : 'text-ink-500'}`}>{m === 'move' ? 'Movimentar' : 'Estoque mínimo'}</button>
        ))}
      </div>

      {mode === 'move' ? (
        <form id="stock-form" onSubmit={submitMove} noValidate className="space-y-4">
          <p className="text-sm">Estoque atual: <strong className="tabular-nums">{target.stock}</strong></p>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="sr-only">Tipo de movimentação</legend>
            {OPS.map((o) => (
              <label key={o.value} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${op === o.value ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-ink-200 hover:border-ink-300'}`}>
                <input type="radio" name="op" value={o.value} checked={op === o.value} onChange={() => setOp(o.value)} className="sr-only" />
                <span className="block font-semibold">{o.label}</span>
                <span className="block text-xs text-ink-500">{o.help}</span>
              </label>
            ))}
          </fieldset>
          <Field label={op === 'set' ? 'Nova quantidade em estoque' : 'Quantidade'}>
            <TextInput inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          </Field>
          <Field label={`Motivo${op === 'out' || op === 'set' ? '' : ' (opcional)'}`}>
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
              placeholder={op === 'in' ? 'Ex.: Compra NF 1234' : op === 'out' ? 'Ex.: Produto avariado' : op === 'sale' ? 'Ex.: Venda no balcão' : 'Ex.: Contagem de inventário'} />
          </Field>
          {after != null && (
            <p className={`rounded-xl px-3 py-2 text-sm ${after < 0 ? 'bg-red-50 text-red-700' : 'bg-ink-50'}`}>
              Estoque: <strong className="tabular-nums">{target.stock}</strong> → <strong className="tabular-nums">{after}</strong>
            </p>
          )}
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        </form>
      ) : (
        <form id="stock-form" onSubmit={submitMin} noValidate className="space-y-4">
          <Field label="Estoque mínimo" hint={target.variantId
            ? `Deixe vazio para usar o mínimo do produto (${target.productMin}). 0 = sem alerta.`
            : 'Alerta de estoque baixo ao atingir este valor. 0 = sem alerta.'}>
            <TextInput inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value)} autoFocus />
          </Field>
          {error && <p role="alert" className="text-sm font-medium text-red-600">{error}</p>}
        </form>
      )}
    </Modal>
  )
}

export default function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('q') ?? ''
  const categoryId = params.get('categoria') ?? ''
  const filter = (params.get('filtro') ?? '') as InventoryFilter
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1)

  const [searchInput, setSearchInput] = useState(search)
  const [items, setItems] = useState<InventoryRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [target, setTarget] = useState<Target | null>(null)

  useEffect(() => { document.title = 'Estoque | Painel'; listAllCategories().then(setCategories).catch(() => {}) }, [])

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
    listInventory({ search, categoryId, filter, page, pageSize: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total) })
      .catch((e) => setError(friendlyError(e, 'Não foi possível carregar o estoque.')))
      .finally(() => setLoading(false))
  }, [search, categoryId, filter, page])
  useEffect(load, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const btn = 'rounded-full px-3 py-1.5 text-xs font-semibold transition'
  const actions = (t: Omit<Target, 'mode'>) => (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <button onClick={() => setTarget({ ...t, mode: 'move' })} className={`${btn} bg-brand text-white hover:brightness-110`} aria-label={`Movimentar estoque de ${t.label}`}>Movimentar</button>
      <button onClick={() => setTarget({ ...t, mode: 'min' })} className={`${btn} border border-ink-200 hover:bg-ink-50`} aria-label={`Estoque mínimo de ${t.label}`}>Mínimo</button>
    </div>
  )

  return (
    <>
      <PageHeader title="Estoque" description={loading ? ' ' : `${total} produto${total === 1 ? '' : 's'}`}
        actions={<Link to="/admin/estoque/movimentacoes" className="btn-secondary">Histórico de movimentações</Link>} />

      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <div className="relative">
          <SearchIcon width={17} height={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <TextInput type="search" placeholder="Buscar por nome ou SKU" aria-label="Buscar no estoque" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Categoria" value={categoryId} onChange={(e) => update({ categoria: e.target.value })}>
          <option value="">Todas as categorias</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Situação" value={filter} onChange={(e) => update({ filtro: e.target.value })}>
          <option value="">Qualquer situação</option>
          <option value="low">Estoque baixo</option>
          <option value="sold_out">Esgotados</option>
          <option value="available">Disponíveis</option>
          <option value="unavailable">Marcados como indisponíveis</option>
        </Select>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !loading && items.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado">Ajuste a busca ou os filtros.</EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((p) => {
            const variants = p.product_variants
            return (
              <li key={p.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
                <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
                  <ProductImage src={p.product_images[0]?.url} alt="" className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-[60%] flex-1">
                    <Link to={`/admin/produtos/${p.id}`} className="line-clamp-1 font-medium hover:underline">{p.name}</Link>
                    <p className="text-xs text-ink-500">{p.category?.name ?? 'Sem categoria'}{p.sku && ` · ${p.sku}`}{!p.is_active && ' · rascunho'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <StatusBadge stock={p.available_stock} min={p.has_variants ? 0 : p.min_stock} available={p.is_available} />
                      {p.has_variants && p.low_stock && <Badge tone="amber">Variação com estoque baixo</Badge>}
                      <span className="text-ink-500">Estoque {p.has_variants ? 'total ' : ''}<strong className="tabular-nums text-ink-900">{p.available_stock}</strong> · mínimo {p.min_stock}</span>
                      <Link to={`/admin/estoque/movimentacoes?produto=${p.id}`} className="font-medium text-brand hover:underline">Histórico</Link>
                    </div>
                  </div>
                  {!p.has_variants && actions({ productId: p.id, variantId: null, label: p.name, stock: p.stock, min: p.min_stock, productMin: p.min_stock })}
                </div>
                {variants.length > 0 && (
                  <ul className="divide-y divide-ink-100 border-t border-ink-100 bg-ink-50/50">
                    {variants.map((v) => {
                      const min = v.min_stock ?? p.min_stock
                      return (
                        <li key={v.id} className={`flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm sm:pl-[5.5rem] sm:pr-4 ${v.is_active ? '' : 'opacity-60'}`}>
                          <div className="min-w-[60%] flex-1">
                            <span className="font-medium">{v.name}</span>{!v.is_active && <span className="text-xs text-ink-500"> (inativa)</span>}
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                              <StatusBadge stock={v.stock} min={min} available={p.is_available} />
                              <span>Estoque <strong className="tabular-nums text-ink-900">{v.stock}</strong> · mínimo {min}{v.min_stock == null && ' (do produto)'}</span>
                            </div>
                          </div>
                          {actions({ productId: p.id, variantId: v.id, label: `${p.name} — ${v.name}`, stock: v.stock, min: v.min_stock, productMin: p.min_stock })}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          <button className="btn-secondary h-10 px-3" disabled={page === 0} onClick={() => update({ pagina: String(page) })} aria-label="Página anterior"><ChevronLeft width={18} height={18} /></button>
          <span className="tabular-nums text-ink-500">Página {page + 1} de {pages}</span>
          <button className="btn-secondary h-10 px-3" disabled={page + 1 >= pages} onClick={() => update({ pagina: String(page + 2) })} aria-label="Próxima página"><ChevronRight width={18} height={18} /></button>
        </div>
      )}

      {target && <StockModal target={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); load() }} />}
    </>
  )
}
