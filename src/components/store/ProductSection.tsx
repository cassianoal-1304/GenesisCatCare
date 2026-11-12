import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchProducts, type ProductQuery } from '../../lib/api'
import type { ProductSummary } from '../../types/db'
import { ArrowRight } from '../ui/Icons'
import { ProductGrid } from './ProductCard'

interface Props {
  title: string
  subtitle?: string
  query: ProductQuery
  seeAllHref: string
  /** Avisa a página se a seção tem produtos (para o estado vazio geral). */
  onResult?: (count: number) => void
}

/** Seção da home (Destaques, Novidades, Ofertas). Não renderiza nada se estiver vazia. */
export function ProductSection({ title, subtitle, query, seeAllHref, onResult }: Props) {
  const [items, setItems] = useState<ProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const key = JSON.stringify(query)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchProducts({ ...query, pageSize: 8 })
      .then((r) => { if (alive) { setItems(r.items); onResult?.(r.total) } })
      .catch(() => { if (alive) { setFailed(true); onResult?.(0) } })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (failed || (!loading && items.length === 0)) return null

  return (
    <section className="container-page py-10 sm:py-14">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="section-title">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        <Link to={seeAllHref} className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand">
          Ver todos <ArrowRight width={16} height={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <ProductGrid products={items} loading={loading} skeletons={4} />
    </section>
  )
}
