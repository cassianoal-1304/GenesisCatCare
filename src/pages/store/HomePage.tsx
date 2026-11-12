import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { ProductSection } from '../../components/store/ProductSection'
import { ProductImage } from '../../components/store/ProductImage'
import { EmptyState } from '../../components/ui/Feedback'
import { ArrowRight } from '../../components/ui/Icons'

function Hero() {
  const { settings } = useStore()
  const s = settings!
  const title = s.hero_title || s.store_name
  const subtitle = s.hero_subtitle || s.tagline

  return (
    <section className="container-page pt-4 sm:pt-6">
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand text-white">
        {s.hero_image_url && (
          <>
            <img src={s.hero_image_url} alt="" fetchPriority="high"
              className="absolute inset-0 -z-10 size-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/65 via-black/35 to-black/5" />
          </>
        )}
        {!s.hero_image_url && (
          <div aria-hidden className="absolute -right-24 -top-24 -z-10 size-[28rem] rounded-full bg-accent/20 blur-3xl" />
        )}
        <div className="flex min-h-[340px] max-w-2xl flex-col justify-center px-6 py-14 sm:min-h-[420px] sm:px-12 lg:min-h-[460px] lg:px-16">
          <h1 className="animate-fade-in font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">{title}</h1>
          {subtitle && <p className="mt-4 max-w-lg animate-fade-in text-base text-white/85 [animation-delay:80ms] sm:text-lg">{subtitle}</p>}
          <div className="mt-8 flex animate-fade-in flex-wrap gap-3 [animation-delay:160ms]">
            <Link to="/catalogo" className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-ink-900 transition hover:bg-ink-50 active:scale-[.98]">
              {s.hero_cta_label || 'Ver catálogo'} <ArrowRight width={16} height={16} />
            </Link>
            <Link to="/catalogo?ofertas=1" className="inline-flex h-12 items-center rounded-full border border-white/40 px-6 text-sm font-semibold text-white transition hover:bg-white/10">
              Ofertas
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function Categories() {
  const { categories } = useStore()
  if (categories.length === 0) return null
  return (
    <section className="container-page pt-10 sm:pt-14">
      <h2 className="section-title mb-6">Categorias</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
        {categories.map((c) => (
          <Link key={c.id} to={`/catalogo?categoria=${c.slug}`}
            className="group w-36 shrink-0 snap-start sm:w-auto">
            <div className="overflow-hidden rounded-2xl ring-1 ring-ink-100">
              {c.image_url
                ? <ProductImage src={c.image_url} alt={c.name} className="aspect-square transition duration-500 group-hover:scale-105" />
                : <div className="grid aspect-square place-items-center bg-brand/8 font-display text-4xl font-semibold text-brand transition group-hover:bg-brand/12">{c.name.charAt(0)}</div>}
            </div>
            <p className="mt-2.5 text-center text-sm font-medium text-ink-900">{c.name}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function HomePage() {
  useDocumentTitle()
  // Controla o estado vazio geral: só exibe quando as três seções retornarem 0
  const [totals, setTotals] = useState<Record<string, number>>({})
  const report = useCallback((k: string) => (n: number) => setTotals((t) => ({ ...t, [k]: n })), [])
  const allLoaded = ['latest', 'featured', 'sale'].every((k) => k in totals)
  const isEmpty = allLoaded && Object.values(totals).every((n) => n === 0)

  return (
    <>
      <Hero />
      <Categories />
      {isEmpty ? (
        <EmptyState title="Catálogo em preparação">
          <p>Em breve nossos produtos estarão disponíveis aqui.</p>
          <p className="mt-4 rounded-xl border border-dashed border-ink-200 bg-white p-4 text-left text-xs text-ink-500">
            <strong className="text-ink-700">Administrador:</strong> os produtos cadastrados e ativos no painel
            administrativo aparecem automaticamente nesta página. Marque produtos como “destaque” e informe
            preços promocionais para preencher as seções de Destaques e Ofertas.
          </p>
        </EmptyState>
      ) : null}
      <ProductSection title="Destaques" subtitle="Selecionados especialmente para você"
        query={{ featured: true }} seeAllHref="/catalogo?destaques=1" onResult={report('featured')} />
      <ProductSection title="Ofertas" subtitle="Aproveite os preços especiais"
        query={{ onSale: true, sort: 'menor-preco' }} seeAllHref="/catalogo?ofertas=1" onResult={report('sale')} />
      <ProductSection title="Novidades" subtitle="Os últimos produtos que chegaram"
        query={{ sort: 'recentes' }} seeAllHref="/catalogo" onResult={report('latest')} />
    </>
  )
}
