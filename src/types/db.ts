export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'completed' | 'canceled'

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
  product_variants: ProductVariant[]
}
