import { Link } from 'react-router-dom'
import type { ProductSummary } from '../../types/db'
import { discountPercent } from '../../lib/format'
import { Price } from './Price'
import { ProductImage } from './ProductImage'

export function ProductCard({ product }: { product: ProductSummary }) {
  const image = product.product_images[0]
  const soldOut = product.available_stock <= 0
  const simplePromo = !product.has_variants && product.promo_price != null

  return (
    <Link
      to={`/produto/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-ink-900/5 hover:ring-ink-200"
    >
      <div className="relative">
        <ProductImage src={image?.url} alt={image?.alt || product.name}
          className={`aspect-square transition duration-500 group-hover:scale-[1.03] ${soldOut ? 'opacity-60' : ''}`} />
        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {soldOut ? (
            <span className="rounded-full bg-ink-900/85 px-2.5 py-1 text-[11px] font-semibold text-white">Esgotado</span>
          ) : product.on_sale && (
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
              {simplePromo ? `-${discountPercent(product.price, product.promo_price!)}%` : 'Oferta'}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
        {product.category && (
          <span className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{product.category.name}</span>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-ink-900 sm:text-[15px]">{product.name}</h3>
        <div className="mt-auto pt-1">
          <Price
            current={product.sort_price}
            original={simplePromo ? product.price : null}
            fromLabel={product.has_variants}
          />
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-ink-100">
      <div className="aspect-square animate-pulse bg-ink-100" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-ink-100" />
      </div>
    </div>
  )
}

export function ProductGrid({ products, loading, skeletons = 8 }: {
  products: ProductSummary[]; loading?: boolean; skeletons?: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <div key={p.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <ProductCard product={p} />
        </div>
      ))}
      {loading && Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={`s${i}`} />)}
    </div>
  )
}
