import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { fetchProducts, type SortOption } from '../../lib/api'
import type { ProductSummary } from '../../types/db'
import { ProductGrid } from '../../components/store/ProductCard'
import { EmptyState, ErrorState } from '../../components/ui/Feedback'
import { CloseIcon, SearchIcon } from '../../components/ui/Icons'

const PAGE_SIZE = 12
const SORTS: { value: SortOption; label: string }[] = [
  { value: 'recentes', label: 'Mais recentes' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
  { value: 'nome', label: 'Nome (A–Z)' },
]

export default function CatalogPage() {
  const { categories } = useStore()
  const [params, setParams] = useSearchParams()

  const search = params.get('q')?.trim() ?? ''
  const categorySlug = params.get('categoria') ?? ''
  const onSale = params.get('ofertas') === '1'
  const featured = params.get('destaques') === '1'
  const sortParam = params.get('ordem') as SortOption | null
  const sort: SortOption = SORTS.some((s) => s.value === sortParam) ? sortParam! : 'recentes'
  const category = categories.find((c) => c.slug === categorySlug)

  const [items, setItems] = useState<ProductSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)

  const title = search ? `Busca: “${search}”` : category?.name ?? (onSale ? 'Ofertas' : featured ? 'Destaques' : 'Todos os produtos')
  useDocumentTitle(title)

  const filterKey = JSON.stringify([search, category?.id, categorySlug, onSale, featured, sort])

  // Reinicia a lista quando os filtros mudam
  useEffect(() => { setItems([]); setPage(0); setTotal(0) }, [filterKey])

  useEffect(() => {
    // Categoria informada na URL mas inexistente/inativa: mostra lista vazia
    if (categorySlug && !category) { setLoading(false); setItems([]); setTotal(0); return }
    let alive = true
    setLoading(true)
    setError(null)
    fetchProducts({ search, categoryId: category?.id, onSale, featured, sort, page, pageSize: PAGE_SIZE })
      .then((r) => {
        if (!alive) return
        setItems((prev) => (page === 0 ? r.items : [...prev, ...r.items.filter((p) => !prev.some((x) => x.id === p.id))]))
        setTotal(r.total)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, page, retry])

  const hasMore = items.length < total

  // Carregamento progressivo ao chegar no fim da lista
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || loading || error) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setPage((p) => p + 1), { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, loading, error])

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next, { replace: true })
  }

  const hasFilters = Boolean(search || categorySlug || onSale || featured)

  return (
    <div className="container-page py-6 sm:py-10">
      <nav className="mb-3 text-xs text-ink-400" aria-label="Trilha">
        <Link to="/" className="hover:text-ink-700">Início</Link> <span className="mx-1">/</span> <span className="text-ink-700">Catálogo</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          {category?.description && <p className="mt-2 max-w-2xl text-sm text-ink-500">{category.description}</p>}
        </div>
        {!loading || items.length > 0 ? (
          <p className="text-sm text-ink-500">{total} {total === 1 ? 'produto' : 'produtos'}</p>
        ) : null}
      </div>

      {/* Filtros */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 border-y border-ink-100 bg-cream/95 px-4 py-3 backdrop-blur sm:top-[72px] sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <div className="flex items-center gap-3">
          <div className="-my-1 flex flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none]">
            <button className={`chip ${!categorySlug ? 'chip-active' : ''}`} onClick={() => update({ categoria: null })}>Todos</button>
            {categories.map((c) => (
              <button key={c.id} className={`chip ${categorySlug === c.slug ? 'chip-active' : ''}`}
                onClick={() => update({ categoria: categorySlug === c.slug ? null : c.slug })}>{c.name}</button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-ink-200" />
            <button className={`chip ${onSale ? 'chip-active' : ''}`} aria-pressed={onSale}
              onClick={() => update({ ofertas: onSale ? null : '1' })}>Em promoção</button>
            <button className={`chip ${featured ? 'chip-active' : ''}`} aria-pressed={featured}
              onClick={() => update({ destaques: featured ? null : '1' })}>Destaques</button>
          </div>
          <label className="sr-only" htmlFor="sort">Ordenar por</label>
          <select id="sort" value={sort} onChange={(e) => update({ ordem: e.target.value === 'recentes' ? null : e.target.value })}
            className="h-9 shrink-0 rounded-full border border-ink-200 bg-white px-3 text-sm font-medium text-ink-700 outline-none focus:border-brand">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {search && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/8 py-1 pl-3 pr-1 text-brand">
              <SearchIcon width={14} height={14} /> {search}
              <button aria-label="Limpar busca" onClick={() => update({ q: null })} className="grid size-6 place-items-center rounded-full hover:bg-brand/10"><CloseIcon width={14} height={14} /></button>
            </span>
          </div>
        )}
      </div>

      <div className="mt-6">
        {error && items.length === 0 ? (
          <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />
        ) : !loading && items.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={<SearchIcon width={28} height={28} />} title="Nenhum produto encontrado"
              action={<button className="btn-secondary" onClick={() => setParams({}, { replace: true })}>Limpar filtros</button>}>
              Tente outros termos de busca ou remova alguns filtros.
            </EmptyState>
          ) : (
            <EmptyState title="Nenhum produto cadastrado ainda">
              Os produtos cadastrados e ativos no painel administrativo aparecerão aqui automaticamente.
            </EmptyState>
          )
        ) : (
          <ProductGrid products={items} loading={loading} skeletons={page === 0 ? 8 : 4} />
        )}

        {error && items.length > 0 && <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />}

        {hasMore && !loading && !error && (
          <div ref={sentinel} className="mt-10 flex justify-center">
            <button className="btn-secondary" onClick={() => setPage((p) => p + 1)}>Carregar mais produtos</button>
          </div>
        )}
      </div>
    </div>
  )
}
