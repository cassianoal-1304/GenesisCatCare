export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'completed' | 'canceled'

export type MovementReason =
  | 'initial' | 'stock_in' | 'stock_out' | 'manual_sale' | 'manual_adjust' | 'order_confirmed' | 'order_reversed'

export interface StoreSettings {
  id: number
  store_name: string
  tagline: string | null
  logo_url: string | null
  primary_color: string
  accent_color: string
  whatsapp_number: string | null
  email: string | null
  phone: string | null
  address: string | null
  business_hours: string | null
  instagram_url: string | null
  facebook_url: string | null
  about_text: string | null
  hero_title: string | null
  hero_subtitle: string | null
  hero_image_url: string | null
  hero_cta_label: string | null
  footer_text: string | null
  meta_description: string | null
  show_stock_count: boolean
  default_min_stock: number
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  sort_order: number
  is_active: boolean
}

export interface ProductImage {
  id?: string
  url: string
  alt: string | null
  sort_order: number
}

export interface ProductVariant {
  id: string
  product_id: string
  name: string
  options: Record<string, string>
  sku: string | null
  price: number | null
  promo_price: number | null
  stock: number
  min_stock?: number | null
  is_active: boolean
  sort_order: number
}

/** Campos usados nas listagens (cards). */
export interface ProductSummary {
  id: string
  name: string
  slug: string
  short_description: string | null
  price: number
  promo_price: number | null
  sort_price: number
  on_sale: boolean
  available_stock: number
  has_variants: boolean
  is_featured: boolean
  is_available: boolean
  created_at: string
  category: Pick<Category, 'name' | 'slug'> | null
  product_images: ProductImage[]
}

export interface ProductDetail extends ProductSummary {
  category_id: string | null
  description: string | null
  indications: string | null
  benefits: string | null
  features: string | null
  additional_info: string | null
  sku: string | null
  stock: number
  min_stock: number
  product_variants: ProductVariant[]
}

/** Linha da listagem do painel. */
export interface AdminProductRow {
  id: string
  name: string
  slug: string
  sku: string | null
  price: number
  promo_price: number | null
  sort_price: number
  stock: number
  available_stock: number
  min_stock: number
  has_variants: boolean
  on_sale: boolean
  low_stock: boolean
  is_active: boolean
  is_featured: boolean
  is_available: boolean
  updated_at: string
  category: Pick<Category, 'name'> | null
  product_images: ProductImage[]
}

export interface AdminProduct extends ProductDetail {
  is_active: boolean
  product_images: (ProductImage & { id: string; storage_path: string | null })[]
}

export interface Order {
  id: string
  order_number: number
  status: OrderStatus
  customer_name: string
  customer_phone: string | null
  customer_city: string | null
  customer_neighborhood: string | null
  total: number
  stock_applied: boolean
  created_at: string
}

export interface OrderItem {
  id: string
  product_id: string | null
  variant_id: string | null
  product_name: string
  variant_name: string | null
  sku: string | null
  unit_price: number
  quantity: number
  line_total: number
}

export interface OrderDetail extends Order {
  delivery_address: string | null
  customer_notes: string | null
  admin_notes: string | null
  subtotal: number
  confirmed_at: string | null
  canceled_at: string | null
  stock_reversed_at: string | null
  updated_at: string
  order_items: OrderItem[]
}

export interface StockMovement {
  id: string
  quantity_change: number
  stock_before: number | null
  stock_after: number
  reason: MovementReason
  note: string | null
  created_at: string
  created_by_email: string | null
  order_id: string | null
  product: { name: string } | null
  variant: { name: string } | null
  order: { order_number: number } | null
}

export interface DashboardStats {
  total: number
  published: number
  drafts: number
  available: number
  sold_out: number
  low_stock: number
  on_sale: number
  featured: number
  pending_orders: number
  categories: number
}
