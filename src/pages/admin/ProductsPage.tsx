import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  deleteProduct, duplicateProduct, listAllCategories, listProducts,
  type AdminCategory, type StatusFilter, type StockFilter,
} from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { formatPrice } from '../../lib/format'
import type { AdminProductRow } from '../../types/db'
import { Badge, PageHeader, Select, TextInput } from '../../components/admin/Form'
import { useConfirm } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { ProductImage } from '../../components/store/ProductImage'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { ChevronLeft, ChevronRight, CopyIcon, EditIcon, ExternalIcon, PlusIcon, SearchIcon, TrashIcon } from '../../components/ui/Icons'

const PAGE_SIZE = 20

function StockBadge({ p }: { p: AdminProductRow }) {
  if (p.available_stock <= 0) return <Badge tone="red">Esgotado</Badge>
  if (p.low_stock) return <Badge tone="amber">Baixo · {p.available_stock}</Badge>
  return <Badge tone="green">{p.available_stock} un.</Badge>
}

export default function ProductsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const notify = useToast()
  const confirm = useConfirm()

  const search = params.get('q') ?? ''
  const categoryId = params.get('categoria') ?? ''
  const status = (params.get('status') ?? '') as StatusFilter
  const stock = (params.get('estoque') ?? '') as StockFilter
  const page = Math.max(0, Number(params.get('pagina') ?? 1) - 1)

  const [searchInput, setSearchInput] = useState(search)
  const [items, setItems] = useState<AdminProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { document.title = 'Produtos | Painel' }, [])
  useEffect(() => { listAllCategories().then(setCategories).catch(() => {}) }, [])

  const update = useCallback((changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('pagina' in changes)) next.delete('pagina')
    setParams(next, { replace: true })
  }, [params, setParams])

  // Busca com atraso para não consultar a cada tecla
  useEffect(() => {
    if (searchInput === search) return
    const t = setTimeout(() => update({ q: searchInput.trim() }), 350)
    return () => clearTimeout(t)
  }, [searchInput, search, update])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    listProducts({ search, categoryId, status, stock, page, pageSize: PAGE_SIZE })
      .then((r) => { setItems(r.items); setTotal(r.total) })
      .catch((e) => setError(friendlyError(e, 'Não foi possível carregar os produtos.')))
      .finally(() => setLoading(false))
  }, [search, categoryId, status, stock, page])
  useEffect(load, [load])

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const onDuplicate = async (p: AdminProductRow) => {
    setBusyId(p.id)
    try {
      const id = await duplicateProduct(p.id)
      notify('Produto duplicado como rascunho, com estoque zerado. Revise antes de publicar.')
      navigate(`/admin/produtos/${id}`)
    } catch (e) { notify(friendlyError(e), 'error') } finally { setBusyId(null) }
  }

  const onDelete = async (p: AdminProductRow) => {
    const ok = await confirm({
      title: 'Excluir produto?', danger: true, confirmLabel: 'Excluir',
      message: <>O produto <strong>{p.name}</strong>, suas variações, imagens e histórico de estoque serão excluídos.
        Pedidos já realizados mantêm o nome e o preço registrados. Esta ação não pode ser desfeita.
        <br /><br />Se quiser apenas ocultá-lo da loja, edite-o e marque como <em>rascunho</em>.</>,
    })
    if (!ok) return
    setBusyId(p.id)
    try { await deleteProduct(p.id); notify('Produto excluído.'); load() }
    catch (e) { notify(friendlyError(e), 'error') } finally { setBusyId(null) }
  }

  const hasFilters = Boolean(search || categoryId || status || stock)

  const actions = (p: AdminProductRow) => (
    <div className="flex items-center justify-end gap-0.5">
      {p.is_active && (
        <a href={`/produto/${p.slug}`} target="_blank" rel="noopener" aria-label={`Ver ${p.name} na loja`} title="Ver na loja"
          className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"><ExternalIcon width={17} height={17} /></a>
      )}
      <Link to={`/admin/produtos/${p.id}`} aria-label={`Editar ${p.name}`} title="Editar"
        className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900"><EditIcon width={17} height={17} /></Link>
      <button onClick={() => onDuplicate(p)} disabled={busyId === p.id} aria-label={`Duplicar ${p.name}`} title="Duplicar"
        className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40"><CopyIcon width={17} height={17} /></button>
      <button onClick={() => onDelete(p)} disabled={busyId === p.id} aria-label={`Excluir ${p.name}`} title="Excluir"
        className="grid size-9 place-items-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><TrashIcon width={17} height={17} /></button>
    </div>
  )

  return (
    <>
      <PageHeader title="Produtos" description={loading ? ' ' : `${total} produto${total === 1 ? '' : 's'}`}
        actions={<Link to="/admin/produtos/novo" className="btn-primary h-11"><PlusIcon width={18} height={18} /> Novo produto</Link>} />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <SearchIcon width={17} height={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <TextInput type="search" placeholder="Buscar por nome ou SKU" aria-label="Buscar produtos" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Categoria" value={categoryId} onChange={(e) => update({ categoria: e.target.value })}>
          <option value="">Todas as categorias</option>
          <option value="none">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Status" value={status} onChange={(e) => update({ status: e.target.value })}>
          <option value="">Publicados e rascunhos</option>
          <option value="published">Publicados</option>
          <option value="draft">Rascunhos</option>
        </Select>
        <Select aria-label="Estoque" value={stock} onChange={(e) => update({ estoque: e.target.value })}>
          <option value="">Qualquer estoque</option>
          <option value="available">Disponíveis</option>
          <option value="sold_out">Esgotados</option>
          <option value="low">Estoque baixo</option>
          <option value="on_sale">Em promoção</option>
          <option value="featured">Em destaque</option>
        </Select>
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : !loading && items.length === 0 ? (
        hasFilters
          ? <EmptyState title="Nenhum produto encontrado" action={<button className="btn-secondary" onClick={() => { setSearchInput(''); setParams({}) }}>Limpar filtros</button>}>Ajuste a busca ou os filtros.</EmptyState>
          : <EmptyState title="Nenhum produto cadastrado" action={<Link to="/admin/produtos/novo" className="btn-primary">Cadastrar primeiro produto</Link>}>Cadastre manualmente ou importe uma planilha CSV.</EmptyState>
      ) : (
        <div className={`overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 transition ${loading ? 'opacity-60' : ''}`}>
          {/* Tabela (desktop) */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-ink-100 bg-ink-50 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
              <tr><th className="px-4 py-3">Produto</th><th className="px-3 py-3">Preço</th><th className="px-3 py-3">Estoque</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {items.map((p) => (
                <tr key={p.id} className="hover:bg-ink-50/60">
                  <td className="px-4 py-3">
                    <Link to={`/admin/produtos/${p.id}`} className="flex items-center gap-3">
                      <ProductImage src={p.product_images[0]?.url} alt="" className="size-12 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="line-clamp-1 font-medium text-ink-900">{p.name}</span>
                        <span className="block text-xs text-ink-500">{p.category?.name ?? 'Sem categoria'}{p.sku && ` · ${p.sku}`}{p.has_variants && ' · com variações'}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {p.has_variants && <span className="text-xs text-ink-500">a partir de </span>}
                    {formatPrice(p.sort_price)}
                    {p.on_sale && <Badge tone="accent">Promo</Badge>}
                  </td>
                  <td className="px-3 py-3"><StockBadge p={p} /></td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.is_active ? <Badge tone="green">Publicado</Badge> : <Badge>Rascunho</Badge>}
                      {!p.is_available && <Badge tone="red">Indisponível</Badge>}
                      {p.is_featured && <Badge tone="blue">Destaque</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-3">{actions(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cartões (celular) */}
          <ul className="divide-y divide-ink-100 md:hidden">
            {items.map((p) => (
              <li key={p.id} className="p-3">
                <Link to={`/admin/produtos/${p.id}`} className="flex gap-3">
                  <ProductImage src={p.product_images[0]?.url} alt="" className="size-16 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{p.has_variants && <span className="text-xs font-normal text-ink-500">a partir de </span>}{formatPrice(p.sort_price)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <StockBadge p={p} />
                      {p.is_active ? <Badge tone="green">Publicado</Badge> : <Badge>Rascunho</Badge>}
                      {!p.is_available && <Badge tone="red">Indisponível</Badge>}
                      {p.on_sale && <Badge tone="accent">Promo</Badge>}
                    </div>
                  </div>
                </Link>
                <div className="mt-1 border-t border-ink-50 pt-1">{actions(p)}</div>
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
