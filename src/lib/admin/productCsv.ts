import { supabase } from '../supabase'
import { normalizeText } from '../format'
import { parseIntSafe, parseMoney, slugify, SLUG_RE, UUID_RE } from './text'
import { toCsv } from './csv'

/* ------------------------------------------------------------------ */
/* Colunas do arquivo (cabeçalho em português)                         */
/* ------------------------------------------------------------------ */
export const COLUMNS = [
  { header: 'id', key: 'id', help: 'Preencha para ATUALIZAR um produto existente. Deixe vazio para criar.' },
  { header: 'nome', key: 'name', help: 'Obrigatório para novos produtos.' },
  { header: 'slug', key: 'slug', help: 'Endereço do produto. Se vazio, é gerado a partir do nome.' },
  { header: 'categoria', key: 'category', help: 'Nome ou slug de uma categoria existente.' },
  { header: 'resumo', key: 'short_description', help: '' },
  { header: 'descricao', key: 'description', help: '' },
  { header: 'indicacoes', key: 'indications', help: '' },
  { header: 'beneficios', key: 'benefits', help: 'Um por linha.' },
  { header: 'caracteristicas', key: 'features', help: 'Uma por linha.' },
  { header: 'informacoes_adicionais', key: 'additional_info', help: '' },
  { header: 'preco', key: 'price', help: 'Obrigatório para novos. Ex.: 49,90' },
  { header: 'preco_promocional', key: 'promo_price', help: 'Vazio = sem promoção.' },
  { header: 'sku', key: 'sku', help: '' },
  { header: 'estoque', key: 'stock', help: 'Apenas produtos sem variações.' },
  { header: 'estoque_minimo', key: 'min_stock', help: '' },
  { header: 'publicado', key: 'is_active', help: 'sim / não' },
  { header: 'disponivel', key: 'is_available', help: 'sim / não' },
  { header: 'destaque', key: 'is_featured', help: 'sim / não' },
  { header: 'imagens', key: 'image_urls', help: 'URLs separadas por " | ". Só adiciona; não remove imagens.' },
] as const

type ColKey = (typeof COLUMNS)[number]['key']
const READ_ONLY_HEADER = 'variacoes_somente_leitura'

const TEXT_KEYS = ['short_description', 'description', 'indications', 'benefits', 'features', 'additional_info'] as const
const BOOL_KEYS = ['is_active', 'is_available', 'is_featured'] as const

const normHeader = (h: string) => normalizeText(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/* ------------------------------------------------------------------ */
/* Exportação                                                          */
/* ------------------------------------------------------------------ */
const yesNo = (b: boolean) => (b ? 'sim' : 'não')
const money = (n: number | null) => (n == null ? '' : Number(n).toFixed(2).replace('.', ','))

interface ExportRow {
  id: string; name: string; slug: string; short_description: string | null; description: string | null
  indications: string | null; benefits: string | null; features: string | null; additional_info: string | null
  price: number; promo_price: number | null; sku: string | null; stock: number; min_stock: number
  is_active: boolean; is_available: boolean; is_featured: boolean
  category: { slug: string } | null
  product_images: { url: string; sort_order: number }[]
  product_variants: { name: string; stock: number; sort_order: number }[]
}

export async function exportProductsCsv(): Promise<{ csv: string; count: number }> {
  const all: ExportRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, slug, short_description, description, indications, benefits, features, additional_info,
        price, promo_price, sku, stock, min_stock, is_active, is_available, is_featured,
        category:categories(slug), product_images(url, sort_order), product_variants(name, stock, sort_order)`)
      .order('name').order('id').range(from, from + 999)
    if (error) throw error
    all.push(...(data as unknown as ExportRow[]))
    if (!data || data.length < 1000) break
  }
  const header = [...COLUMNS.map((c) => c.header), READ_ONLY_HEADER]
  const rows = all.map((p) => {
    const variants = [...p.product_variants].sort((a, b) => a.sort_order - b.sort_order)
    return [
      p.id, p.name, p.slug, p.category?.slug ?? '', p.short_description, p.description, p.indications,
      p.benefits, p.features, p.additional_info, money(p.price), money(p.promo_price), p.sku,
      variants.length ? '' : p.stock, p.min_stock, yesNo(p.is_active), yesNo(p.is_available), yesNo(p.is_featured),
      [...p.product_images].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.url).join(' | '),
      variants.map((v) => `${v.name} (${v.stock})`).join(' | '),
    ]
  })
  return { csv: toCsv([header, ...rows]), count: all.length }
}

export const templateCsv = () => toCsv([COLUMNS.map((c) => c.header)])

/* ------------------------------------------------------------------ */
/* Importação: validação e prévia                                      */
/* ------------------------------------------------------------------ */
export interface ImportRow {
  line: number
  action: 'create' | 'update' | 'error'
  name: string
  errors: string[]
  warnings: string[]
  payload: Record<string, unknown> | null
}

interface ExistingProduct { id: string; name: string; slug: string; sku: string | null; price: number; has_variants: boolean }
interface CategoryRef { id: string; name: string; slug: string }

async function loadReference() {
  const products: ExistingProduct[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('products').select('id, name, slug, sku, price, has_variants').order('id').range(from, from + 999)
    if (error) throw error
    products.push(...(data as ExistingProduct[]))
    if (!data || data.length < 1000) break
  }
  const { data: cats, error } = await supabase.from('categories').select('id, name, slug')
  if (error) throw error
  return { products, categories: (cats ?? []) as CategoryRef[] }
}

function parseBool(v: string): boolean | null | 'invalid' {
  const s = normalizeText(v)
  if (!s) return null
  if (['sim', 's', 'yes', 'y', 'true', '1', 'x', 'verdadeiro'].includes(s)) return true
  if (['nao', 'n', 'no', 'false', '0', 'falso'].includes(s)) return false
  return 'invalid'
}

/**
 * Valida as linhas do CSV. Nada é gravado aqui: o resultado alimenta a prévia
 * e, após confirmação, as linhas válidas são enviadas a admin_import_products.
 */
export async function validateImport(table: string[][]): Promise<{ rows: ImportRow[]; fatal?: string; ignoredColumns: string[] }> {
  if (table.length < 2) return { rows: [], fatal: 'O arquivo não possui linhas de produtos.', ignoredColumns: [] }
  const headers = table[0].map(normHeader)
  const colIndex = new Map<ColKey, number>()
  const ignoredColumns: string[] = []
  headers.forEach((h, i) => {
    const col = COLUMNS.find((c) => c.header === h)
    if (col && !colIndex.has(col.key)) colIndex.set(col.key, i)
    else if (h && h !== READ_ONLY_HEADER) ignoredColumns.push(table[0][i])
  })
  if (!colIndex.has('id') && !colIndex.has('name')) {
    return { rows: [], fatal: 'Cabeçalho não reconhecido. Use o modelo (colunas "id", "nome", "preco"...).', ignoredColumns }
  }
  if (table.length - 1 > 2000) return { rows: [], fatal: 'Máximo de 2000 produtos por arquivo.', ignoredColumns }

  const { products, categories } = await loadReference()
  const byId = new Map(products.map((p) => [p.id, p]))
  const bySlug = new Map(products.map((p) => [p.slug, p]))
  const bySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p]))
  const findCategory = (v: string) => {
    const n = normalizeText(v)
    return categories.find((c) => c.slug === n || normalizeText(c.name) === n || c.slug === slugify(v))
  }

  const seenSlugs = new Map<string, number>()
  const seenSkus = new Map<string, number>()
  const seenIds = new Map<string, number>()
  const has = (k: ColKey) => colIndex.has(k)

  const rows: ImportRow[] = table.slice(1).map((cells, idx) => {
    const line = idx + 2
    const get = (k: ColKey) => (has(k) ? (cells[colIndex.get(k)!] ?? '').trim() : '')
    const errors: string[] = []
    const warnings: string[] = []
    const payload: Record<string, unknown> = { _line: line }

    // Identificação: atualização (id) ou criação
    const id = get('id')
    let existing: ExistingProduct | undefined
    if (id) {
      if (!UUID_RE.test(id)) errors.push('ID inválido.')
      else if (!(existing = byId.get(id))) errors.push('ID não encontrado. Para criar um produto, deixe o ID vazio.')
      else if (seenIds.has(id)) errors.push(`ID repetido (linha ${seenIds.get(id)}).`)
      else { seenIds.set(id, line); payload.id = id }
    }
    const isUpdate = Boolean(existing)

    // Nome
    const name = get('name')
    if (name) { if (name.length > 150) errors.push('Nome com mais de 150 caracteres.'); else payload.name = name }
    else if (!isUpdate) errors.push('Nome obrigatório.')

    // Slug (gerado a partir do nome em novos produtos)
    let slug = get('slug').toLowerCase()
    if (!slug && !isUpdate && name) slug = slugify(name)
    if (slug) {
      if (!SLUG_RE.test(slug)) errors.push('Slug inválido (use letras minúsculas, números e hífens).')
      else {
        const owner = bySlug.get(slug)
        if (owner && owner.id !== existing?.id) {
          errors.push(isUpdate ? `Slug "${slug}" já pertence a "${owner.name}".`
            : `Já existe o produto "${owner.name}" com este slug. Para atualizá-lo, informe o ID ${owner.id}.`)
        } else if (seenSlugs.has(slug)) errors.push(`Slug repetido no arquivo (linha ${seenSlugs.get(slug)}).`)
        else { seenSlugs.set(slug, line); payload.slug = slug }
      }
    }

    // Categoria
    if (has('category')) {
      const c = get('category')
      if (!c) payload.category_id = null
      else {
        const cat = findCategory(c)
        if (cat) payload.category_id = cat.id
        else errors.push(`Categoria "${c}" não encontrada. Crie-a antes de importar.`)
      }
    }

    // Textos opcionais (vazio = limpar o campo)
    for (const k of TEXT_KEYS) if (has(k)) payload[k] = get(k) || null

    // Preços
    const priceRaw = get('price')
    let price: number | null = existing ? Number(existing.price) : null
    if (priceRaw) {
      const p = parseMoney(priceRaw)
      if (p == null || Number.isNaN(p) || p < 0) errors.push(`Preço inválido: "${priceRaw}".`)
      else { price = p; payload.price = p }
    } else if (!isUpdate) errors.push('Preço obrigatório.')
    if (has('promo_price')) {
      const raw = get('promo_price')
      const promo = parseMoney(raw)
      if (promo != null && (Number.isNaN(promo) || promo < 0)) errors.push(`Preço promocional inválido: "${raw}".`)
      else if (promo != null && price != null && promo >= price) errors.push('Preço promocional deve ser menor que o preço.')
      else payload.promo_price = promo
    }

    // SKU
    if (has('sku')) {
      const sku = get('sku')
      if (!sku) payload.sku = null
      else {
        const owner = bySku.get(sku.toLowerCase())
        if (owner && owner.id !== existing?.id) errors.push(`SKU "${sku}" já pertence a "${owner.name}".`)
        else if (seenSkus.has(sku.toLowerCase())) errors.push(`SKU repetido no arquivo (linha ${seenSkus.get(sku.toLowerCase())}).`)
        else { seenSkus.set(sku.toLowerCase(), line); payload.sku = sku }
      }
    }

    // Estoque
    for (const k of ['stock', 'min_stock'] as const) {
      const raw = get(k)
      if (!raw) continue
      const n = parseIntSafe(raw)
      if (n == null || Number.isNaN(n)) errors.push(`${k === 'stock' ? 'Estoque' : 'Estoque mínimo'} inválido: "${raw}".`)
      else if (k === 'stock' && existing?.has_variants) warnings.push('Estoque ignorado: produto com variações (ajuste no painel).')
      else payload[k] = n
    }

    // Sim/não
    for (const k of BOOL_KEYS) {
      const raw = get(k)
      if (!raw) continue
      const b = parseBool(raw)
      if (b === 'invalid') errors.push(`Valor "${raw}" inválido na coluna ${COLUMNS.find((c) => c.key === k)!.header} (use sim ou não).`)
      else payload[k] = b
    }

    // Imagens por URL
    const imgs = get('image_urls')
    if (imgs) {
      const urls = imgs.split(/\s*[|\n]\s*/).filter(Boolean)
      const bad = urls.filter((u) => !/^https?:\/\/\S+$/i.test(u))
      if (bad.length) errors.push(`URL de imagem inválida (deve começar com https://): ${bad[0]}`)
      else payload.image_urls = urls.slice(0, 12)
    }

    if (isUpdate && Object.keys(payload).length <= 2) warnings.push('Nenhum campo para atualizar.')
    return {
      line, name: name || existing?.name || '(sem nome)', errors, warnings,
      action: errors.length ? 'error' : isUpdate ? 'update' : 'create',
      payload: errors.length ? null : payload,
    }
  })
  return { rows, ignoredColumns }
}

export async function runImport(rows: ImportRow[]): Promise<{ created: number; updated: number }> {
  const payload = rows.filter((r) => r.payload).map((r) => r.payload)
  const { data, error } = await supabase.rpc('admin_import_products', { p_rows: payload })
  if (error) throw error
  return data as { created: number; updated: number }
}
