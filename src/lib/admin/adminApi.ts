import { supabase } from '../supabase'
import type {
  AdminProduct, AdminProductRow, Category, DashboardStats, Order, StockMovement, StoreSettings,
} from '../../types/db'
import { optimizeAndUpload, removeUnusedFiles } from './images'

/** Lança o erro original do Supabase (convertido depois por friendlyError). */
function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

/* ================================================================== */
/* Dashboard                                                           */
/* ================================================================== */
export async function getDashboard() {
  const [stats, orders, movements] = await Promise.all([
    supabase.rpc('admin_dashboard_stats'),
    supabase.from('orders')
      .select('id, order_number, status, customer_name, customer_phone, customer_city, customer_neighborhood, total, stock_applied, created_at')
      .order('created_at', { ascending: false }).limit(6),
    supabase.from('stock_movements')
      .select('id, quantity_change, stock_before, stock_after, reason, note, created_at, created_by_email, order_id, product:products(name), variant:product_variants(name), order:orders(order_number)')
      .order('created_at', { ascending: false }).limit(8),
  ])
  return {
    stats: check(stats) as DashboardStats,
    orders: check(orders) as Order[],
    movements: check(movements) as unknown as StockMovement[],
  }
}

/* ================================================================== */
/* Produtos — listagem                                                 */
/* ================================================================== */
export type StatusFilter = '' | 'published' | 'draft'
export type StockFilter = '' | 'available' | 'sold_out' | 'low' | 'on_sale' | 'featured'

export interface AdminProductQuery {
  search?: string
  categoryId?: string
  status?: StatusFilter
  stock?: StockFilter
  page: number
  pageSize: number
}

export async function listProducts(q: AdminProductQuery) {
  let query = supabase
    .from('products')
    .select(`id, name, slug, sku, price, promo_price, sort_price, stock, available_stock, min_stock,
      has_variants, on_sale, low_stock, is_active, is_featured, is_available, updated_at,
      category:categories(name), product_images(url, alt, sort_order)`, { count: 'exact' })
    .order('sort_order', { referencedTable: 'product_images' })
    .limit(1, { referencedTable: 'product_images' })

  const term = q.search?.trim()
  if (term) {
    const t = term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[\\%_,()]/g, ' ')
    query = query.ilike('search_text', `%${t}%`)
  }
  if (q.categoryId === 'none') query = query.is('category_id', null)
  else if (q.categoryId) query = query.eq('category_id', q.categoryId)
  if (q.status === 'published') query = query.eq('is_active', true)
  if (q.status === 'draft') query = query.eq('is_active', false)
  if (q.stock === 'available') query = query.gt('available_stock', 0).eq('is_available', true)
  if (q.stock === 'sold_out') query = query.eq('available_stock', 0)
  if (q.stock === 'low') query = query.eq('low_stock', true)
  if (q.stock === 'on_sale') query = query.eq('on_sale', true)
  if (q.stock === 'featured') query = query.eq('is_featured', true)

  const from = q.page * q.pageSize
  const res = await query.order('updated_at', { ascending: false }).order('id').range(from, from + q.pageSize - 1)
  if (res.error) throw res.error
  return { items: (res.data ?? []) as unknown as AdminProductRow[], total: res.count ?? 0 }
}

/* ================================================================== */
/* Produtos — leitura, gravação, exclusão                              */
/* ================================================================== */
export async function getProduct(id: string): Promise<AdminProduct | null> {
  const res = await supabase
    .from('products')
    .select(`*, category:categories(name, slug),
      product_images(id, url, alt, sort_order, storage_path),
      product_variants(id, product_id, name, options, sku, price, promo_price, stock, is_active, sort_order)`)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'product_images' })
    .order('sort_order', { referencedTable: 'product_variants' })
    .maybeSingle()
  return check(res) as unknown as AdminProduct | null
}

export interface ProductFields {
  name: string
  slug: string
  category_id: string | null
  short_description: string | null
  description: string | null
  indications: string | null
  benefits: string | null
  features: string | null
  additional_info: string | null
  price: number
  promo_price: number | null
  sku: string | null
  min_stock: number
  is_active: boolean
  is_featured: boolean
  is_available: boolean
}

export interface VariantInput {
  id?: string
  name: string
  options: Record<string, string>
  sku: string | null
  price: number | null
  promo_price: number | null
  stock: number
  originalStock: number   // estoque quando o formulário foi carregado
  is_active: boolean
}

export interface ImageInput {
  id?: string
  url: string
  storage_path: string | null
  alt: string | null
  file?: File             // nova imagem ou substituição pendente
}

export interface SaveProductInput {
  id?: string
  fields: ProductFields
  stock: number            // usado quando o produto não tem variações
  originalStock: number
  variants: VariantInput[]
  removedVariantIds: string[]
  images: ImageInput[]     // na ordem final (a primeira é a principal)
  removedImages: { id: string; storage_path: string | null }[]
}

/**
 * Salva o produto completo. Alterações de estoque em registros existentes
 * são enviadas como AJUSTE (diferença) pela função admin_adjust_stock, que
 * trava a linha e registra o histórico — assim uma venda confirmada durante
 * a edição não é sobrescrita.
 * Retorna o id e avisos não fatais (ex.: falha no envio de uma imagem).
 */
export async function saveProduct(input: SaveProductInput): Promise<{ id: string; warnings: string[] }> {
  const warnings: string[] = []
  let id = input.id

  // 1) Produto
  if (id) {
    check(await supabase.from('products').update(input.fields).eq('id', id))
    const delta = input.stock - input.originalStock
    if (input.variants.length === 0 && delta !== 0) {
      check(await supabase.rpc('admin_adjust_stock', {
        p_product_id: id, p_variant_id: null, p_change: delta, p_note: 'Edição do produto',
      }))
    }
  } else {
    const created = check(await supabase.from('products')
      .insert({ ...input.fields, stock: input.variants.length ? 0 : input.stock })
      .select('id').single()) as { id: string }
    id = created.id
  }

  // 2) Variações
  if (input.removedVariantIds.length) {
    check(await supabase.from('product_variants').delete().in('id', input.removedVariantIds))
  }
  for (const [i, v] of input.variants.entries()) {
    const row = {
      name: v.name, options: v.options, sku: v.sku, price: v.price,
      promo_price: v.promo_price, is_active: v.is_active, sort_order: i,
    }
    if (v.id) {
      check(await supabase.from('product_variants').update(row).eq('id', v.id))
      const delta = v.stock - v.originalStock
      if (delta !== 0) {
        check(await supabase.rpc('admin_adjust_stock', {
          p_product_id: id, p_variant_id: v.id, p_change: delta, p_note: 'Edição do produto',
        }))
      }
    } else {
      check(await supabase.from('product_variants').insert({ ...row, product_id: id, stock: v.stock }))
    }
  }

  // 3) Imagens
  const obsoletePaths: (string | null)[] = []
  if (input.removedImages.length) {
    check(await supabase.from('product_images').delete().in('id', input.removedImages.map((r) => r.id)))
    obsoletePaths.push(...input.removedImages.map((r) => r.storage_path))
  }
  for (const [i, img] of input.images.entries()) {
    try {
      if (img.file) {
        const up = await optimizeAndUpload(img.file, `products/${id}`)
        if (img.id) {
          check(await supabase.from('product_images')
            .update({ url: up.url, storage_path: up.path, sort_order: i }).eq('id', img.id))
          obsoletePaths.push(img.storage_path)           // arquivo substituído
        } else {
          check(await supabase.from('product_images')
            .insert({ product_id: id, url: up.url, storage_path: up.path, alt: img.alt, sort_order: i }))
        }
      } else if (img.id) {
        check(await supabase.from('product_images').update({ sort_order: i, alt: img.alt }).eq('id', img.id))
      } else {
        check(await supabase.from('product_images')
          .insert({ product_id: id, url: img.url, storage_path: null, alt: img.alt, sort_order: i }))
      }
    } catch (e) {
      warnings.push(`Imagem ${i + 1}: ${(e as Error).message || 'falha no envio'}`)
    }
  }
  await removeUnusedFiles(obsoletePaths)

  return { id: id!, warnings }
}

export async function deleteProduct(id: string) {
  const imgs = check(await supabase.from('product_images').select('storage_path').eq('product_id', id)) as { storage_path: string | null }[]
  check(await supabase.from('products').delete().eq('id', id))
  await removeUnusedFiles(imgs.map((i) => i.storage_path))
}

export async function duplicateProduct(id: string): Promise<string> {
  return check(await supabase.rpc('admin_duplicate_product', { p_product_id: id })) as string
}

/** Verifica se slug/SKU já estão em uso por outro produto. */
export async function isSlugTaken(slug: string, exceptId?: string) {
  let q = supabase.from('products').select('id', { count: 'exact', head: true }).eq('slug', slug)
  if (exceptId) q = q.neq('id', exceptId)
  const { count, error } = await q
  if (error) throw error
  return (count ?? 0) > 0
}

/* ================================================================== */
/* Categorias                                                          */
/* ================================================================== */
export type AdminCategory = Category & { product_count: number }

export async function listAllCategories(): Promise<AdminCategory[]> {
  const rows = check(await supabase
    .from('categories')
    .select('id, name, slug, description, image_url, sort_order, is_active, products(count)')
    .order('sort_order').order('name')) as unknown as (Category & { products: { count: number }[] })[]
  return rows.map(({ products, ...c }) => ({ ...c, product_count: products?.[0]?.count ?? 0 }))
}

export type CategoryFields = Pick<Category, 'name' | 'slug' | 'description' | 'image_url' | 'is_active'>

export async function saveCategory(fields: CategoryFields, id?: string, sortOrder?: number) {
  if (id) check(await supabase.from('categories').update(fields).eq('id', id))
  else check(await supabase.from('categories').insert({ ...fields, sort_order: sortOrder ?? 0 }))
}

export async function deleteCategory(id: string) {
  check(await supabase.from('categories').delete().eq('id', id))
}

export async function reorderCategories(ids: string[]) {
  check(await supabase.rpc('admin_reorder_categories', { p_ids: ids }))
}

/* ================================================================== */
/* Configurações                                                       */
/* ================================================================== */
export async function updateSettings(fields: Partial<StoreSettings>) {
  const { id: _id, ...rest } = fields
  void _id
  check(await supabase.from('store_settings').update(rest).eq('id', 1))
}
