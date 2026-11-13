import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../../context/StoreContext'
import {
  deleteProduct, duplicateProduct, getProduct, isSlugTaken, listAllCategories, saveProduct,
  type AdminCategory, type ImageInput, type VariantInput,
} from '../../lib/admin/adminApi'
import { friendlyError } from '../../lib/admin/errors'
import { emptyToNull, parseIntSafe, parseMoney, slugify, SLUG_RE } from '../../lib/admin/text'
import type { AdminProduct } from '../../types/db'
import { Card, Field, Select, TextArea, TextInput, Toggle } from '../../components/admin/Form'
import { ImageManager, type ImageItem } from '../../components/admin/ImageManager'
import { useConfirm } from '../../components/admin/Modal'
import { useToast } from '../../components/admin/Toast'
import { VariantEditor, variantName, type VariantItem } from '../../components/admin/VariantEditor'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { ChevronLeft, CopyIcon, ExternalIcon, TrashIcon } from '../../components/ui/Icons'

interface FormState {
  name: string
  slug: string
  slugEdited: boolean
  category_id: string
  short_description: string
  description: string
  indications: string
  benefits: string
  features: string
  additional_info: string
  price: string
  promo_price: string
  sku: string
  stock: string
  originalStock: number
  min_stock: string
  is_active: boolean
  is_featured: boolean
  is_available: boolean
}

const money = (n: number | null | undefined) => (n == null ? '' : Number(n).toFixed(2).replace('.', ','))

function emptyForm(defaultMinStock: number): FormState {
  return {
    name: '', slug: '', slugEdited: false, category_id: '', short_description: '', description: '',
    indications: '', benefits: '', features: '', additional_info: '', price: '', promo_price: '', sku: '',
    stock: '0', originalStock: 0, min_stock: String(defaultMinStock), is_active: true, is_featured: false, is_available: true,
  }
}

function fromProduct(p: AdminProduct) {
  const form: FormState = {
    name: p.name, slug: p.slug, slugEdited: true, category_id: p.category_id ?? '',
    short_description: p.short_description ?? '', description: p.description ?? '', indications: p.indications ?? '',
    benefits: p.benefits ?? '', features: p.features ?? '', additional_info: p.additional_info ?? '',
    price: money(p.price), promo_price: money(p.promo_price), sku: p.sku ?? '', stock: String(p.stock),
    originalStock: p.stock, min_stock: String(p.min_stock), is_active: p.is_active, is_featured: p.is_featured,
    is_available: p.is_available,
  }
  const attributes: string[] = []
  p.product_variants.forEach((v) => Object.keys(v.options ?? {}).forEach((k) => !attributes.includes(k) && attributes.push(k)))
  const variants: VariantItem[] = p.product_variants.map((v) => ({
    key: v.id, id: v.id, options: Object.fromEntries(attributes.map((a) => [a, v.options?.[a] ?? ''])), name: v.name,
    sku: v.sku ?? '', price: money(v.price), promo_price: money(v.promo_price), stock: String(v.stock),
    originalStock: v.stock, is_active: v.is_active,
  }))
  const images: ImageItem[] = p.product_images.map((i) => ({ key: i.id, id: i.id, url: i.url, storage_path: i.storage_path, alt: i.alt }))
  return { form, attributes, variants, images }
}

type Errors = Record<string, string>

export default function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const notify = useToast()
  const confirm = useConfirm()
  const { settings } = useStore()

  const [loading, setLoading] = useState(!isNew)
  const [loadError, setLoadError] = useState('')
  const [categories, setCategories] = useState<AdminCategory[]>([])
  const [form, setForm] = useState<FormState>(() => emptyForm(settings?.default_min_stock ?? 0))
  const [attributes, setAttributes] = useState<string[]>([])
  const [variants, setVariants] = useState<VariantItem[]>([])
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([])
  const [images, setImages] = useState<ImageItem[]>([])
  const [removedImages, setRemovedImages] = useState<{ id: string; storage_path: string | null }[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    setLoading(true)
    setLoadError('')
    getProduct(id)
      .then((p) => {
        if (!p) { setLoadError('Produto não encontrado.'); return }
        const s = fromProduct(p)
        setForm(s.form); setAttributes(s.attributes); setVariants(s.variants); setImages(s.images)
        setRemovedVariantIds([]); setRemovedImages([]); setDirty(false); setErrors({}); setVariantErrors({})
        document.title = `${p.name} | Painel`
      })
      .catch((e) => setLoadError(friendlyError(e, 'Não foi possível carregar o produto.')))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { if (isNew) document.title = 'Novo produto | Painel'; load() }, [isNew, load])
  useEffect(() => { listAllCategories().then(setCategories).catch(() => {}) }, [])

  // Aviso ao sair com alterações não salvas
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    confirm({ title: 'Descartar alterações?', message: 'Existem alterações não salvas neste produto.', confirmLabel: 'Sair sem salvar', danger: true })
      .then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker, confirm])
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setDirty(true)
    setForm((f) => {
      const next = { ...f, [key]: value }
      if (key === 'name' && !f.slugEdited) next.slug = slugify(String(value))
      return next
    })
    if (errors[key as string]) setErrors((e) => ({ ...e, [key]: '' }))
  }

  const hasVariants = variants.length > 0

  /* ---------------------------------------------------------------- */
  /* Validação                                                         */
  /* ---------------------------------------------------------------- */
  function validate() {
    const e: Errors = {}
    const ve: Record<string, string> = {}
    const price = parseMoney(form.price)
    const promo = parseMoney(form.promo_price)

    if (!form.name.trim()) e.name = 'Informe o nome do produto.'
    else if (form.name.trim().length > 150) e.name = 'Máximo de 150 caracteres.'
    if (!SLUG_RE.test(form.slug)) e.slug = 'Use apenas letras minúsculas, números e hífens.'
    if (price == null) e.price = 'Informe o preço.'
    else if (Number.isNaN(price) || price < 0) e.price = 'Preço inválido. Ex.: 49,90'
    if (promo != null && (Number.isNaN(promo) || promo < 0)) e.promo_price = 'Preço promocional inválido.'
    else if (promo != null && price != null && promo >= price) e.promo_price = 'Deve ser menor que o preço normal.'
    const minStock = parseIntSafe(form.min_stock)
    if (minStock == null || Number.isNaN(minStock)) e.min_stock = 'Informe um número inteiro (0 = sem alerta).'
    if (!hasVariants) {
      const stock = parseIntSafe(form.stock)
      if (stock == null || Number.isNaN(stock)) e.stock = 'Informe um número inteiro maior ou igual a zero.'
    }

    const names = new Set<string>()
    const skus = new Set<string>(form.sku.trim() ? [form.sku.trim().toLowerCase()] : [])
    for (const v of variants) {
      const name = variantName(v, attributes)
      const vp = parseMoney(v.price)
      const vpromo = parseMoney(v.promo_price)
      const stock = parseIntSafe(v.stock)
      const sku = v.sku.trim().toLowerCase()
      let msg = ''
      if (attributes.length && attributes.some((a) => !v.options[a]?.trim())) msg = `Preencha ${attributes.join(' e ')}.`
      else if (!name.trim()) msg = 'Informe o nome da opção.'
      else if (names.has(name.toLowerCase())) msg = 'Variação repetida.'
      else if (vp != null && (Number.isNaN(vp) || vp < 0)) msg = 'Preço inválido.'
      else if (vpromo != null && (Number.isNaN(vpromo) || vpromo < 0)) msg = 'Preço promocional inválido.'
      else if (vpromo != null && vpromo >= (vp ?? price ?? Infinity)) msg = 'O promocional deve ser menor que o preço.'
      else if (stock == null || Number.isNaN(stock)) msg = 'Estoque deve ser um número inteiro ≥ 0.'
      else if (sku && skus.has(sku)) msg = 'SKU repetido.'
      if (msg) ve[v.key] = msg
      names.add(name.toLowerCase())
      if (sku) skus.add(sku)
    }
    setErrors(e)
    setVariantErrors(ve)
    return Object.keys(e).length === 0 && Object.keys(ve).length === 0
  }

  /* ---------------------------------------------------------------- */
  /* Salvar                                                            */
  /* ---------------------------------------------------------------- */
  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate()) {
      notify('Corrija os campos destacados.', 'error')
      setTimeout(() => document.querySelector('[aria-invalid="true"], [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return
    }
    setSaving(true)
    try {
      if (await isSlugTaken(form.slug, id)) {
        setErrors({ slug: 'Já existe outro produto com este endereço.' })
        notify('Endereço (slug) já está em uso.', 'error')
        return
      }
      const variantInputs: VariantInput[] = variants.map((v) => ({
        id: v.id, name: variantName(v, attributes).slice(0, 120),
        options: Object.fromEntries(attributes.map((a) => [a, v.options[a].trim()])),
        sku: emptyToNull(v.sku), price: parseMoney(v.price), promo_price: parseMoney(v.promo_price),
        stock: parseIntSafe(v.stock) ?? 0, originalStock: v.originalStock, is_active: v.is_active,
      }))
      const imageInputs: ImageInput[] = images.map((i) => ({ id: i.id, url: i.url, storage_path: i.storage_path, alt: i.alt, file: i.file }))

      const { id: savedId, warnings } = await saveProduct({
        id,
        fields: {
          name: form.name.trim(), slug: form.slug, category_id: form.category_id || null,
          short_description: emptyToNull(form.short_description), description: emptyToNull(form.description),
          indications: emptyToNull(form.indications), benefits: emptyToNull(form.benefits),
          features: emptyToNull(form.features), additional_info: emptyToNull(form.additional_info),
          price: parseMoney(form.price)!, promo_price: parseMoney(form.promo_price), sku: emptyToNull(form.sku),
          min_stock: parseIntSafe(form.min_stock) ?? 0,
          is_active: form.is_active, is_featured: form.is_featured, is_available: form.is_available,
        },
        stock: parseIntSafe(form.stock) ?? 0,
        originalStock: form.originalStock,
        variants: variantInputs,
        removedVariantIds,
        images: imageInputs,
        removedImages,
      })
      setDirty(false)
      if (warnings.length) notify(`Produto salvo, mas houve problemas:\n${warnings.join('\n')}`, 'error')
      else notify(isNew ? 'Produto cadastrado.' : 'Alterações salvas.')
      if (isNew) navigate(`/admin/produtos/${savedId}`, { replace: true })
      else load()
    } catch (e) {
      notify(friendlyError(e, 'Não foi possível salvar o produto.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!id) return
    const ok = await confirm({ title: 'Excluir produto?', danger: true, confirmLabel: 'Excluir',
      message: <>O produto <strong>{form.name}</strong> será excluído permanentemente, com variações, imagens e histórico de estoque.</> })
    if (!ok) return
    try { setDirty(false); await deleteProduct(id); notify('Produto excluído.'); navigate('/admin/produtos', { replace: true }) }
    catch (e) { notify(friendlyError(e), 'error') }
  }

  const onDuplicate = async () => {
    if (!id) return
    if (dirty && !(await confirm({ title: 'Duplicar sem salvar?', message: 'A cópia será feita a partir da última versão salva.' }))) return
    try { const newId = await duplicateProduct(id); setDirty(false); notify('Cópia criada como rascunho, com estoque zerado.'); navigate(`/admin/produtos/${newId}`) }
    catch (e) { notify(friendlyError(e), 'error') }
  }

  if (loading) return <Spinner />
  if (loadError) return <ErrorState message={loadError} onRetry={load} />

  const err = (k: keyof FormState) => errors[k] || undefined
  const inv = (k: keyof FormState) => (errors[k] ? true : undefined)

  return (
    <form onSubmit={onSubmit} noValidate className="pb-24 lg:pb-0">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/admin/produtos" aria-label="Voltar para produtos" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink-100"><ChevronLeft /></Link>
          <h1 className="truncate font-display text-2xl font-semibold tracking-tight">{isNew ? 'Novo produto' : form.name || 'Editar produto'}</h1>
        </div>
        {!isNew && (
          <div className="flex gap-1">
            {form.is_active && <a href={`/produto/${form.slug}`} target="_blank" rel="noopener" className="btn-secondary h-10 px-3 text-sm"><ExternalIcon width={16} height={16} /> Ver na loja</a>}
            <button type="button" onClick={onDuplicate} className="btn-secondary h-10 px-3 text-sm"><CopyIcon width={16} height={16} /> Duplicar</button>
            <button type="button" onClick={onDelete} className="btn-secondary h-10 px-3 text-sm hover:!border-red-200 hover:!bg-red-50 hover:!text-red-700"><TrashIcon width={16} height={16} /><span className="sr-only sm:not-sr-only">Excluir</span></button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Card title="Informações básicas">
            <div className="space-y-4">
              <Field label="Nome" required error={err('name')}>
                <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={150} aria-invalid={inv('name')} placeholder="Ex.: Arranhador de sisal 60 cm" />
              </Field>
              <Field label="Resumo" hint="Frase curta exibida abaixo do nome (opcional).">
                <TextInput value={form.short_description} onChange={(e) => set('short_description', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Descrição">
                <TextArea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} />
              </Field>
            </div>
          </Card>

          <Card title="Imagens" description="A primeira imagem é a principal, exibida no catálogo.">
            <ImageManager images={images}
              onChange={(next) => { setImages(next); setDirty(true) }}
              onRemove={(img) => {
                setImages((list) => list.filter((i) => i.key !== img.key))
                if (img.id) setRemovedImages((r) => [...r, { id: img.id!, storage_path: img.storage_path }])
                setDirty(true)
              }}
              onError={(m) => notify(m, 'error')} />
          </Card>

          <Card title="Preço">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Preço (R$)" required error={err('price')}>
                <TextInput inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0,00" aria-invalid={inv('price')} />
              </Field>
              <Field label="Preço promocional (R$)" error={err('promo_price')} hint="Deixe em branco se não estiver em promoção.">
                <TextInput inputMode="decimal" value={form.promo_price} onChange={(e) => set('promo_price', e.target.value)} placeholder="0,00" aria-invalid={inv('promo_price')} />
              </Field>
            </div>
          </Card>

          <Card title="Variações e estoque" description="Use variações para tamanhos, cores, modelos etc. Cada uma tem estoque próprio.">
            {!hasVariants && (
              <div className="mb-5 grid gap-4 sm:grid-cols-2">
                <Field label="Estoque" required error={err('stock')}
                  hint={!isNew ? 'Alterações são registradas no histórico de estoque.' : undefined}>
                  <TextInput inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} aria-invalid={inv('stock')} />
                </Field>
                <Field label="Estoque mínimo" error={err('min_stock')} hint="Alerta de estoque baixo ao atingir este valor (0 = desativado).">
                  <TextInput inputMode="numeric" value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} aria-invalid={inv('min_stock')} />
                </Field>
              </div>
            )}
            {hasVariants && (
              <div className="mb-5 max-w-xs">
                <Field label="Estoque mínimo por variação" error={err('min_stock')} hint="0 = sem alerta.">
                  <TextInput inputMode="numeric" value={form.min_stock} onChange={(e) => set('min_stock', e.target.value)} aria-invalid={inv('min_stock')} />
                </Field>
              </div>
            )}
            <VariantEditor attributes={attributes} variants={variants} errors={variantErrors}
              onAttributesChange={(a) => { setAttributes(a); setDirty(true) }}
              onChange={(v) => { setVariants(v); setDirty(true) }}
              onRemove={(v) => {
                setVariants((list) => list.filter((x) => x.key !== v.key))
                if (v.id) setRemovedVariantIds((r) => [...r, v.id!])
                setDirty(true)
              }} />
          </Card>

          <Card title="Detalhes" description="Campos opcionais. Os vazios não aparecem na loja.">
            <div className="space-y-4">
              <Field label="Indicações"><TextArea value={form.indications} onChange={(e) => set('indications', e.target.value)} rows={3} /></Field>
              <Field label="Benefícios" hint="Um benefício por linha."><TextArea value={form.benefits} onChange={(e) => set('benefits', e.target.value)} rows={4} /></Field>
              <Field label="Características" hint="Uma característica por linha (ex.: Material: sisal)."><TextArea value={form.features} onChange={(e) => set('features', e.target.value)} rows={4} /></Field>
              <Field label="Informações adicionais"><TextArea value={form.additional_info} onChange={(e) => set('additional_info', e.target.value)} rows={3} /></Field>
            </div>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <Card title="Publicação">
            <div className="space-y-3">
              <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} label="Publicado"
                description={form.is_active ? 'Visível na loja.' : 'Rascunho: oculto da loja.'} />
              <Toggle checked={form.is_available} onChange={(v) => set('is_available', v)} label="Disponível para venda"
                description={form.is_available ? 'Clientes podem comprar.' : 'Aparece na loja, mas não pode ser comprado.'} />
              <Toggle checked={form.is_featured} onChange={(v) => set('is_featured', v)} label="Produto em destaque"
                description="Aparece na seção Destaques da página inicial." />
            </div>
            <button type="submit" disabled={saving} className="btn-primary mt-5 hidden w-full lg:inline-flex">
              {saving ? 'Salvando...' : isNew ? 'Cadastrar produto' : 'Salvar alterações'}
            </button>
          </Card>

          <Card title="Organização">
            <div className="space-y-4">
              <Field label="Categoria" hint={categories.length === 0 ? <>Nenhuma categoria. <Link to="/admin/categorias" className="text-brand underline">Criar categorias</Link></> : undefined}>
                <Select value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">Sem categoria</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{!c.is_active ? ' (inativa)' : ''}</option>)}
                </Select>
              </Field>
              <Field label="Endereço (slug)" error={err('slug')} hint={`/produto/${form.slug || '...'}`}>
                <TextInput value={form.slug} aria-invalid={inv('slug')}
                  onChange={(e) => { set('slug', e.target.value.toLowerCase()); setForm((f) => ({ ...f, slugEdited: true })) }} />
              </Field>
              <Field label="SKU / código" hint="Opcional.">
                <TextInput value={form.sku} onChange={(e) => set('sku', e.target.value)} maxLength={60} />
              </Field>
            </div>
          </Card>
        </aside>
      </div>

      {/* Barra de salvar (celular/tablet) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-white/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Salvando...' : isNew ? 'Cadastrar produto' : 'Salvar alterações'}
        </button>
      </div>
    </form>
  )
}
