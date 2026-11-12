-- =====================================================================
-- 001_schema.sql — Tabelas, tipos, índices e triggers
-- Execute no SQL Editor do Supabase, na ordem: 001, 002, 003, 004.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
do $$ begin
  create type public.order_status as enum
    ('pending', 'confirmed', 'shipped', 'completed', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.stock_reason as enum
    ('manual_adjust', 'order_confirmed', 'order_canceled');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Função genérica de updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Administradores (vinculados ao Supabase Auth)
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Configurações da loja (linha única, id = 1)
-- ---------------------------------------------------------------------
create table if not exists public.store_settings (
  id               smallint primary key default 1 check (id = 1),
  store_name       text not null default 'Genesis Cat Care' check (char_length(store_name) between 1 and 80),
  tagline          text,
  logo_url         text,
  primary_color    text not null default '#1f3a3d' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  accent_color     text not null default '#e07a5f' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  whatsapp_number  text check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$'),
  email            text,
  phone            text,
  address          text,
  business_hours   text,
  instagram_url    text,
  facebook_url     text,
  about_text       text,
  hero_title       text,
  hero_subtitle    text,
  hero_image_url   text,
  hero_cta_label   text,
  footer_text      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

insert into public.store_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_settings_updated on public.store_settings;
create trigger trg_settings_updated before update on public.store_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_categories_active_order on public.categories (is_active, sort_order);

drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Produtos
--   * benefits / features: um item por linha (exibidos como lista).
--   * stock: usado quando o produto NÃO possui variações.
--   * sort_price, on_sale, available_stock, has_variants e search_text
--     são calculados automaticamente por trigger (não editar).
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid references public.categories(id) on delete set null,
  name              text not null check (char_length(name) between 1 and 150),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description text,
  description       text,
  indications       text,
  benefits          text,
  features          text,
  additional_info   text,
  price             numeric(10,2) not null check (price >= 0),
  promo_price       numeric(10,2) check (promo_price is null or (promo_price >= 0 and promo_price < price)),
  sku               text unique,
  stock             integer not null default 0 check (stock >= 0),
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  -- campos calculados
  has_variants      boolean not null default false,
  sort_price        numeric(10,2) not null default 0,
  on_sale           boolean not null default false,
  available_stock   integer not null default 0,
  search_text       text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_products_category   on public.products (category_id);
create index if not exists idx_products_active      on public.products (is_active, created_at desc);
create index if not exists idx_products_featured    on public.products (is_featured) where is_featured;
create index if not exists idx_products_on_sale     on public.products (on_sale) where on_sale;
create index if not exists idx_products_sort_price  on public.products (sort_price);
create index if not exists idx_products_search_trgm on public.products using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Imagens dos produtos
-- ---------------------------------------------------------------------
create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,
  url          text not null,
  storage_path text,
  alt          text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_product_images_product on public.product_images (product_id, sort_order);

-- ---------------------------------------------------------------------
-- Variações (tamanho, cor, modelo...)
--   options: objeto JSON, ex.: {"Tamanho": "M", "Cor": "Azul"}
--   price / promo_price: opcionais; se nulos, usa o preço do produto.
-- ---------------------------------------------------------------------
create table if not exists public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  options     jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  sku         text unique,
  price       numeric(10,2) check (price is null or price >= 0),
  promo_price numeric(10,2) check (promo_price is null or promo_price >= 0),
  stock       integer not null default 0 check (stock >= 0),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_variants_product on public.product_variants (product_id, sort_order);

drop trigger if exists trg_variants_updated on public.product_variants;
create trigger trg_variants_updated before update on public.product_variants
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Campos calculados do produto
-- ---------------------------------------------------------------------
create or replace function public.compute_product_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count    integer;
  v_min      numeric(10,2);
  v_sale     boolean;
  v_stock    integer;
begin
  new.updated_at := now();

  select count(*),
         min(coalesce(v.promo_price, v.price, new.promo_price, new.price)),
         bool_or(coalesce(v.promo_price, case when v.price is null then new.promo_price end) is not null),
         coalesce(sum(v.stock), 0)
    into v_count, v_min, v_sale, v_stock
    from public.product_variants v
   where v.product_id = new.id and v.is_active;

  new.has_variants := v_count > 0;

  if v_count > 0 then
    new.sort_price      := v_min;
    new.on_sale         := coalesce(v_sale, false);
    new.available_stock := v_stock;
  else
    new.sort_price      := coalesce(new.promo_price, new.price);
    new.on_sale         := new.promo_price is not null;
    new.available_stock := new.stock;
  end if;

  new.search_text := lower(extensions.unaccent(
    coalesce(new.name, '') || ' ' || coalesce(new.short_description, '') || ' ' || coalesce(new.sku, '')
  ));
  return new;
end $$;

drop trigger if exists trg_products_compute on public.products;
create trigger trg_products_compute before insert or update on public.products
  for each row execute function public.compute_product_fields();

-- Quando uma variação muda, recalcula o produto
create or replace function public.touch_product_from_variant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.products set updated_at = now() where id = old.product_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.product_id <> old.product_id) then
    update public.products set updated_at = now() where id = new.product_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_variants_touch_product on public.product_variants;
create trigger trg_variants_touch_product after insert or update or delete on public.product_variants
  for each row execute function public.touch_product_from_variant();

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     bigint generated always as identity (start with 1001) unique,
  status           public.order_status not null default 'pending',
  customer_name    text not null check (char_length(customer_name) between 2 and 120),
  customer_phone   text not null check (customer_phone ~ '^[0-9]{10,15}$'),
  customer_email   text,
  delivery_method  text,
  delivery_address text,
  customer_notes   text check (customer_notes is null or char_length(customer_notes) <= 1000),
  admin_notes      text,
  subtotal         numeric(10,2) not null check (subtotal >= 0),
  total            numeric(10,2) not null check (total >= 0),
  stock_applied    boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_orders_status_created on public.orders (status, created_at desc);
create index if not exists idx_orders_phone on public.orders (customer_phone, created_at desc);

drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- Itens guardam nome e preço do momento da compra (histórico imutável)
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  product_id   uuid references public.products(id) on delete set null,
  variant_id   uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  variant_name text,
  sku          text,
  unit_price   numeric(10,2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity between 1 and 999),
  line_total   numeric(10,2) not null check (line_total >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- Movimentações de estoque (histórico/auditoria)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_id      uuid references public.product_variants(id) on delete cascade,
  order_id        uuid references public.orders(id) on delete set null,
  quantity_change integer not null check (quantity_change <> 0),
  stock_after     integer not null check (stock_after >= 0),
  reason          public.stock_reason not null,
  note            text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_stock_mov_product on public.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_mov_order   on public.stock_movements (order_id);
