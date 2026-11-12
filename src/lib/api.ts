import { supabase } from './supabase'
import { escapeLike, normalizeText } from './format'
import type { Category, ProductDetail, ProductSummary, StoreSettings } from '../types/db'

/** Erro amigável a partir de um erro do Supabase. */
export class ApiError extends Error {}

function fail(error: { message: string } | null, fallback: string): never {
  if (error) console.error(error)
  throw new ApiError(fallback)
}

export const SUMMARY_FIELDS = `
  id, name, slug, short_description, price, promo_price, sort_price, on_sale,
  available_stock, has_variants, is_featured, created_at,
  category:categories(name, slug),
  product_images(url, alt, sort_order)
`

export async function fetchSettings(): Promise<StoreSettings> {
  const { data, error } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
  if (error || !data) fail(error, 'Não foi possível carregar as configurações da loja.')
  return data as StoreSettings
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, description, image_url, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order')
    .order('name')
  if (error) fail(error, 'Não foi possível carregar as categorias.')
  return (data ?? []) as Category[]
}

export type SortOption = 'recentes' | 'menor-preco' | 'maior-preco' | 'nome'

export interface ProductQuery {
  search?: string
  categoryId?: string
  onSale?: boolean
  featured?: boolean
  sort?: SortOption
  page?: number
  pageSize?: number
}

export interface ProductPage {
  items: ProductSummary[]
  total: number
}

export async function fetchProducts(q: ProductQuery = {}): Promise<ProductPage> {
  const pageSize = q.pageSize ?? 12
  const page = q.page ?? 0

  let query = supabase
    .from('products')
    .select(SUMMARY_FIELDS, { count: 'exact' })
    .eq('is_active', true)
    .order('sort_order', { referencedTable: 'product_images' })
    .limit(1, { referencedTable: 'product_images' })

  const term = q.search ? escapeLike(normalizeText(q.search)) : ''
  if (term) query = query.ilike('search_text', `%${term}%`)
  if (q.categoryId) query = query.eq('category_id', q.categoryId)
  if (q.onSale) query = query.eq('on_sale', true)
  if (q.featured) query = query.eq('is_featured', true)

  switch (q.sort) {
    case 'menor-preco': query = query.order('sort_price', { ascending: true }); break
    case 'maior-preco': query = query.order('sort_price', { ascending: false }); break
    case 'nome': query = query.order('name', { ascending: true }); break
    default: query = query.order('created_at', { ascending: false })
  }
  query = query.order('id').range(page * pageSize, page * pageSize + pageSize - 1)

  const { data, error, count } = await query
  if (error) fail(error, 'Não foi possível carregar os produtos.')
  return { items: (data ?? []) as unknown as ProductSummary[], total: count ?? 0 }
}

export async function fetchProductBySlug(slug: string): Promise<ProductDetail | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      ${SUMMARY_FIELDS},
      category_id, description, indications, benefits, features, additional_info, sku, stock,
      product_variants(id, product_id, name, options, sku, price, promo_price, stock, is_active, sort_order)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .order('sort_order', { referencedTable: 'product_images' })
    .order('sort_order', { referencedTable: 'product_variants' })
    .maybeSingle()
  if (error) fail(error, 'Não foi possível carregar o produto.')
  if (!data) return null
  const product = data as unknown as ProductDetail
  product.product_variants = product.product_variants.filter((v) => v.is_active)
  return product
}
