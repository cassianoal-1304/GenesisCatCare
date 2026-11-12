import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCart } from '../../context/CartContext'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { fetchProductBySlug } from '../../lib/api'
import { hasText, toList } from '../../lib/format'
import type { ProductDetail, ProductVariant } from '../../types/db'
import { Price } from '../../components/store/Price'
import { ProductImage } from '../../components/store/ProductImage'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight } from '../../components/ui/Icons'
import { QuantityInput } from '../../components/ui/QuantityInput'
import NotFoundPage from './NotFoundPage'

/* ------------------------------------------------------------------ */
/* Preço efetivo (mesma regra da função create_order no banco)         */
/* ------------------------------------------------------------------ */
function priceOf(p: ProductDetail, v: ProductVariant | null) {
  if (!v) return { current: p.promo_price ?? p.price, original: p.promo_price != null ? p.price : null }
  if (v.promo_price != null) return { current: v.promo_price, original: v.price ?? p.price }
  if (v.price != null) return { current: v.price, original: null }
  return { current: p.promo_price ?? p.price, original: p.promo_price != null ? p.price : null }
}

/* ------------------------------------------------------------------ */
/* Galeria                                                             */
/* ------------------------------------------------------------------ */
function Gallery({ product }: { product: ProductDetail }) {
  const images = product.product_images
  const [index, setIndex] = useState(0)
  const go = (d: number) => setIndex((i) => (i + d + images.length) % images.length)
  const current = images[index]

  return (
    <div className="lg:sticky lg:top-24">
      <div className="group relative overflow-hidden rounded-3xl bg-white ring-1 ring-ink-100">
        <ProductImage key={current?.url} src={current?.url} alt={current?.alt || product.name} eager className="aspect-square animate-fade-in" />
        {images.length > 1 && (
          <>
            <button onClick={() => go(-1)} aria-label="Foto anterior"
              className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100">
              <ChevronLeft />
            </button>
            <button onClick={() => go(1)} aria-label="Próxima foto"
              className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100">
              <ChevronRight />
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-ink-900/70 px-2.5 py-1 text-xs font-medium text-white tabular-nums">
              {index + 1}/{images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <button key={img.url + i} onClick={() => setIndex(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === index}
              className={`shrink-0 overflow-hidden rounded-xl ring-2 transition ${i === index ? 'ring-brand' : 'ring-transparent opacity-70 hover:opacity-100'}`}>
              <ProductImage src={img.url} alt="" className="size-16 sm:size-20" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Seletor de variações                                                */
/* Se as variações têm opções (ex.: Tamanho, Cor), exibe um grupo por  */
/* atributo; caso contrário, exibe a lista de variações pelo nome.     */
/* ------------------------------------------------------------------ */
function useVariantSelection(variants: ProductVariant[]) {
  const attributes = useMemo(() => {
    const keys: string[] = []
    variants.forEach((v) => Object.keys(v.options ?? {}).forEach((k) => !keys.includes(k) && keys.push(k)))
    const usable = keys.length > 0 && variants.every((v) => keys.every((k) => hasText(v.options?.[k])))
    if (!usable) return []
    return keys.map((k) => ({
      name: k,
      values: [...new Set(variants.map((v) => v.options[k]))],
    }))
  }, [variants])

  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [variantId, setVariantId] = useState<string | null>(null)

  // Pré-seleciona quando há apenas uma variação
  useEffect(() => {
    if (variants.length === 1) {
      setVariantId(variants[0].id)
      setChosen({ ...variants[0].options })
    } else { setVariantId(null); setChosen({}) }
  }, [variants])

  const selected = attributes.length
    ? variants.find((v) => attributes.every((a) => v.options[a.name] === chosen[a.name])) ?? null
    : variants.find((v) => v.id === variantId) ?? null

  const choose = (attr: string, value: string) => {
    setChosen((prev) => {
      const next = { ...prev, [attr]: prev[attr] === value ? '' : value }
      // Descarta escolhas incompatíveis com a nova seleção
      for (const a of attributes) {
        if (a.name === attr || !next[a.name]) continue
        const ok = variants.some((v) => v.options[attr] === next[attr] && v.options[a.name] === next[a.name])
        if (!ok) next[a.name] = ''
      }
      return next
    })
  }

  /** Valor existe em combinação com as demais escolhas? / Tem estoque? */
  const valueState = (attr: string, value: string) => {
    const matches = variants.filter((v) =>
      v.options[attr] === value &&
      attributes.every((a) => a.name === attr || !chosen[a.name] || v.options[a.name] === chosen[a.name]))
    return { exists: matches.length > 0, inStock: matches.some((v) => v.stock > 0) }
  }

  return { attributes, chosen, choose, valueState, selected, setVariantId }
}

/* ------------------------------------------------------------------ */
/* Seções de conteúdo (só renderizam quando preenchidas)               */
/* ------------------------------------------------------------------ */
function InfoSection({ title, children, defaultOpen }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-ink-100 py-1 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-semibold text-ink-900">
        {title}
        <ChevronDown className="text-ink-400 transition group-open:rotate-180" />
      </summary>
      <div className="pb-5 text-[15px] leading-relaxed text-ink-700">{children}</div>
    </details>
  )
}

const Paragraphs = ({ text }: { text: string }) => <p className="whitespace-pre-line">{text.trim()}</p>

const Bullets = ({ text }: { text: string }) => (
  <ul className="space-y-2">
    {toList(text).map((item, i) => (
      <li key={i} className="flex gap-2.5">
        <CheckIcon width={18} height={18} className="mt-0.5 shrink-0 text-brand" /> <span>{item}</span>
      </li>
    ))}
  </ul>
)

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */
export default function ProductPage() {
  const { slug = '' } = useParams()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let alive = true
    setStatus('loading')
    fetchProductBySlug(slug)
      .then((p) => { if (!alive) return; setProduct(p); setStatus(p ? 'ready' : 'notfound') })
      .catch((e: Error) => { if (alive) { setError(e.message); setStatus('error') } })
    return () => { alive = false }
  }, [slug, retry])

  useDocumentTitle(product?.name)

  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorState message={error} onRetry={() => setRetry((n) => n + 1)} />
  if (status === 'notfound' || !product) {
    return <NotFoundPage title="Produto não encontrado" message="Este produto não existe ou não está mais disponível." />
  }
  return <ProductView product={product} />
}

function ProductView({ product }: { product: ProductDetail }) {
  const { add, open } = useCart()
  const variants = product.product_variants
  const hasVariants = variants.length > 0
  const sel = useVariantSelection(variants)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const [warning, setWarning] = useState('')

  const variant = sel.selected
  const stock = hasVariants ? (variant ? variant.stock : product.available_stock) : product.stock
  const soldOut = hasVariants ? (variant ? variant.stock <= 0 : product.available_stock <= 0) : product.stock <= 0
  const { current, original } = priceOf(product, variant)
  const showFrom = hasVariants && !variant && variants.some((v) => priceOf(product, v).current !== current)

  useEffect(() => { setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, stock))) }, [stock])
  useEffect(() => { setWarning('') }, [variant?.id])

  const handleAdd = () => {
    if (hasVariants && !variant) {
      setWarning(sel.attributes.length ? `Selecione ${sel.attributes.map((a) => a.name.toLowerCase()).join(' e ')}.` : 'Selecione uma opção.')
      return
    }
    if (soldOut) return
    add({
      productId: product.id,
      variantId: variant?.id ?? null,
      slug: product.slug,
      name: product.name,
      variantName: variant?.name ?? null,
      image: product.product_images[0]?.url ?? null,
      unitPrice: Number(current),
      maxQuantity: stock,
    }, quantity)
    setAdded(true)
    setTimeout(() => setAdded(false), 1800)
    open()
  }

  const sections: { title: string; content: ReactNode }[] = []
  if (hasText(product.description)) sections.push({ title: 'Descrição', content: <Paragraphs text={product.description!} /> })
  if (hasText(product.indications)) sections.push({ title: 'Indicações', content: <Paragraphs text={product.indications!} /> })
  if (hasText(product.benefits)) sections.push({ title: 'Benefícios', content: <Bullets text={product.benefits!} /> })
  if (hasText(product.features)) sections.push({ title: 'Características', content: <Bullets text={product.features!} /> })
  if (hasText(product.additional_info)) sections.push({ title: 'Informações adicionais', content: <Paragraphs text={product.additional_info!} /> })

  const sku = variant?.sku || product.sku

  return (
    <div className="container-page py-6 sm:py-10">
      <nav className="mb-5 flex flex-wrap gap-1 text-xs text-ink-400" aria-label="Trilha">
        <Link to="/" className="hover:text-ink-700">Início</Link><span>/</span>
        <Link to="/catalogo" className="hover:text-ink-700">Catálogo</Link>
        {product.category && <><span>/</span><Link to={`/catalogo?categoria=${product.category.slug}`} className="hover:text-ink-700">{product.category.name}</Link></>}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <Gallery product={product} />

        <div className="animate-fade-in">
          {product.category && (
            <Link to={`/catalogo?categoria=${product.category.slug}`} className="text-xs font-semibold uppercase tracking-wider text-brand">
              {product.category.name}
            </Link>
          )}
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{product.name}</h1>
          {hasText(product.short_description) && <p className="mt-3 text-ink-500">{product.short_description}</p>}

          <div className="mt-5"><Price size="lg" current={showFrom ? product.sort_price : current} original={showFrom ? null : original} fromLabel={showFrom} /></div>

          {/* Variações */}
          {hasVariants && (
            <div className="mt-7 space-y-5">
              {sel.attributes.length > 0 ? sel.attributes.map((attr) => (
                <fieldset key={attr.name}>
                  <legend className="mb-2.5 text-sm font-semibold text-ink-900">
                    {attr.name}{sel.chosen[attr.name] && <span className="font-normal text-ink-500">: {sel.chosen[attr.name]}</span>}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {attr.values.map((value) => {
                      const st = sel.valueState(attr.name, value)
                      const active = sel.chosen[attr.name] === value
                      return (
                        <button key={value} type="button" onClick={() => sel.choose(attr.name, value)} aria-pressed={active}
                          className={`min-w-12 rounded-xl border px-4 py-2.5 text-sm font-medium transition ${active ? 'border-brand bg-brand text-white' : 'border-ink-200 bg-white text-ink-900 hover:border-ink-400'} ${!st.exists || !st.inStock ? 'opacity-45' : ''} ${!st.inStock ? 'line-through' : ''}`}>
                          {value}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )) : (
                <fieldset>
                  <legend className="mb-2.5 text-sm font-semibold text-ink-900">Opções</legend>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => {
                      const active = variant?.id === v.id
                      return (
                        <button key={v.id} type="button" onClick={() => sel.setVariantId(active ? null : v.id)} aria-pressed={active}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${active ? 'border-brand bg-brand text-white' : 'border-ink-200 bg-white hover:border-ink-400'} ${v.stock <= 0 ? 'opacity-45 line-through' : ''}`}>
                          {v.name}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {/* Disponibilidade */}
          <p className={`mt-6 text-sm font-medium ${soldOut ? 'text-red-600' : 'text-emerald-700'}`}>
            {soldOut
              ? (variant ? 'Esta opção está esgotada' : 'Produto esgotado')
              : (!hasVariants || variant)
                ? stock <= 5 ? `Últimas ${stock} unidade${stock > 1 ? 's' : ''}!` : 'Em estoque'
                : 'Selecione as opções para ver a disponibilidade'}
          </p>

          {/* Compra */}
          <div className="mt-4 flex gap-3">
            <QuantityInput value={quantity} max={stock} onChange={setQuantity} disabled={soldOut} />
            <button onClick={handleAdd} disabled={soldOut} className="btn-primary min-w-0 flex-1">
              {added ? <><CheckIcon width={18} height={18} /> Adicionado</> : soldOut ? 'Indisponível' : 'Adicionar ao carrinho'}
            </button>
          </div>
          {warning && <p role="alert" className="mt-3 text-sm font-medium text-accent">{warning}</p>}

          {sku && <p className="mt-5 text-xs text-ink-400">Código: {sku}</p>}

          {sections.length > 0 && (
            <div className="mt-8 border-t border-ink-100">
              {sections.map((s, i) => <InfoSection key={s.title} title={s.title} defaultOpen={i === 0}>{s.content}</InfoSection>)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
