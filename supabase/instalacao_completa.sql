-- =====================================================================
-- INSTALAÇÃO COMPLETA DO BANCO (gerado automaticamente — não edite)
-- Contém, em ordem: 001_schema.sql, 002_functions.sql, 003_rls.sql, 004_storage.sql, 006_admin.sql, 007_orders_stock.sql, 008_security.sql
-- Execute de uma vez no SQL Editor do Supabase em um projeto NOVO.
-- Depois, crie o administrador com supabase/migrations/005_create_admin.sql.
-- =====================================================================

-- >>>>>>>>>>>>>>>>>>>> 001_schema.sql <<<<<<<<<<<<<<<<<<<<
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


-- >>>>>>>>>>>>>>>>>>>> 002_functions.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 002_functions.sql — Regras de negócio no banco
--   * is_admin()                     → usado pelas políticas RLS
--   * registro automático de estoque → toda alteração gera movimentação
--   * create_order()                 → único caminho público para pedidos
--   * admin_update_order_status()    → baixa/devolução atômica de estoque
--   * admin_adjust_stock()           → ajuste manual com histórico
-- =====================================================================

-- ---------------------------------------------------------------------
-- is_admin
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Histórico automático de estoque
-- Qualquer alteração na coluna "stock" (produto ou variação) gera uma
-- linha em stock_movements. Funções internas informam o motivo via
-- set_config('app.stock_reason' / 'app.stock_order_id' / 'app.stock_note').
-- ---------------------------------------------------------------------
create or replace function public.log_stock_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_delta   integer;
  v_reason  public.stock_reason;
  v_order   uuid;
  v_product uuid;
  v_variant uuid;
begin
  v_delta := new.stock - (case when tg_op = 'INSERT' then 0 else old.stock end);
  if v_delta = 0 then
    return null;
  end if;

  v_reason := coalesce(nullif(current_setting('app.stock_reason', true), ''), 'manual_adjust')::public.stock_reason;
  v_order  := nullif(current_setting('app.stock_order_id', true), '')::uuid;

  if tg_table_name = 'product_variants' then
    v_product := new.product_id;
    v_variant := new.id;
  else
    v_product := new.id;
    v_variant := null;
  end if;

  insert into public.stock_movements
    (product_id, variant_id, order_id, quantity_change, stock_after, reason, note, created_by)
  values
    (v_product, v_variant, v_order, v_delta, new.stock, v_reason,
     coalesce(nullif(current_setting('app.stock_note', true), ''),
              case when tg_op = 'INSERT' then 'Estoque inicial' end),
     auth.uid());
  return null;
end $$;

drop trigger if exists trg_products_stock_log on public.products;
create trigger trg_products_stock_log after insert or update of stock on public.products
  for each row execute function public.log_stock_change();

drop trigger if exists trg_variants_stock_log on public.product_variants;
create trigger trg_variants_stock_log after insert or update of stock on public.product_variants
  for each row execute function public.log_stock_change();

-- ---------------------------------------------------------------------
-- create_order — chamado pela loja (visitante anônimo)
--
-- p_customer: {"name","phone","email","delivery_method","delivery_address","notes"}
-- p_items:    [{"product_id","variant_id"(opcional),"quantity"}]
--
-- Preços e disponibilidade são SEMPRE calculados aqui, nunca confiados
-- ao navegador. O pedido nasce "pending" e não baixa estoque; a baixa
-- ocorre quando o administrador confirma o pedido.
-- Retorna o resumo oficial do pedido (usado na mensagem do WhatsApp).
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name     text := btrim(coalesce(p_customer->>'name', ''));
  v_phone    text := regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g');
  v_email    text := nullif(btrim(coalesce(p_customer->>'email', '')), '');
  v_method   text := nullif(btrim(coalesce(p_customer->>'delivery_method', '')), '');
  v_address  text := nullif(btrim(coalesce(p_customer->>'delivery_address', '')), '');
  v_notes    text := nullif(btrim(coalesce(p_customer->>'notes', '')), '');
  v_order_id uuid;
  v_number   bigint;
  v_subtotal numeric(10,2) := 0;
  v_items    jsonb := '[]'::jsonb;
  r          record;
  v_product  public.products%rowtype;
  v_variant  public.product_variants%rowtype;
  v_price    numeric(10,2);
  v_stock    integer;
  v_vname    text;
  v_sku      text;
begin
  -- Validação do cliente
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome completo.' using errcode = 'P0001';
  end if;
  if v_phone !~ '^[0-9]{10,15}$' then
    raise exception 'Informe um telefone válido com DDD.' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.' using errcode = 'P0001';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Observações muito longas (máx. 1000 caracteres).' using errcode = 'P0001';
  end if;
  if v_address is not null and char_length(v_address) > 500 then
    raise exception 'Endereço muito longo.' using errcode = 'P0001';
  end if;
  if v_method is not null and char_length(v_method) > 60 then
    raise exception 'Forma de entrega inválida.' using errcode = 'P0001';
  end if;

  -- Validação dos itens
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'O carrinho está vazio ou possui itens demais.' using errcode = 'P0001';
  end if;

  -- Proteção básica contra abuso: limite de pedidos pendentes por telefone
  if (select count(*) from public.orders o
       where o.customer_phone = v_phone and o.status = 'pending'
         and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos recentes. Aguarde o contato da loja.' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_email, delivery_method,
                             delivery_address, customer_notes, subtotal, total)
  values (v_name, v_phone, v_email, v_method, v_address, v_notes, 0, 0)
  returning id, order_number into v_order_id, v_number;

  -- Agrupa linhas repetidas do mesmo produto/variação
  for r in
    select (e->>'product_id')::uuid as product_id,
           nullif(e->>'variant_id', '')::uuid as variant_id,
           sum((e->>'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) e
     group by 1, 2
  loop
    if r.product_id is null or r.quantity is null or r.quantity < 1 or r.quantity > 999 then
      raise exception 'Item inválido no carrinho.' using errcode = 'P0001';
    end if;

    select * into v_product from public.products p where p.id = r.product_id and p.is_active;
    if not found then
      raise exception 'Um dos produtos não está mais disponível.' using errcode = 'P0001';
    end if;

    if v_product.has_variants then
      if r.variant_id is null then
        raise exception 'Selecione uma opção para "%".', v_product.name using errcode = 'P0001';
      end if;
      select * into v_variant from public.product_variants v
       where v.id = r.variant_id and v.product_id = v_product.id and v.is_active;
      if not found then
        raise exception 'A opção escolhida de "%" não está mais disponível.', v_product.name using errcode = 'P0001';
      end if;
      v_price := coalesce(v_variant.promo_price, v_variant.price, v_product.promo_price, v_product.price);
      v_stock := v_variant.stock;
      v_vname := v_variant.name;
      v_sku   := coalesce(v_variant.sku, v_product.sku);
    else
      if r.variant_id is not null then
        raise exception 'Item inválido no carrinho.' using errcode = 'P0001';
      end if;
      v_price := coalesce(v_product.promo_price, v_product.price);
      v_stock := v_product.stock;
      v_vname := null;
      v_sku   := v_product.sku;
    end if;

    if v_stock < r.quantity then
      if v_stock = 0 then
        raise exception '"%" está esgotado.', v_product.name || coalesce(' - ' || v_vname, '') using errcode = 'P0001';
      end if;
      raise exception 'Restam apenas % unidade(s) de "%".', v_stock, v_product.name || coalesce(' - ' || v_vname, '') using errcode = 'P0001';
    end if;

    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name,
                                    sku, unit_price, quantity, line_total)
    values (v_order_id, v_product.id, r.variant_id, v_product.name, v_vname,
            v_sku, v_price, r.quantity, v_price * r.quantity);

    v_subtotal := v_subtotal + v_price * r.quantity;
    v_items := v_items || jsonb_build_object(
      'product_name', v_product.name, 'variant_name', v_vname, 'sku', v_sku,
      'unit_price', v_price, 'quantity', r.quantity, 'line_total', v_price * r.quantity);
  end loop;

  update public.orders set subtotal = v_subtotal, total = v_subtotal where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id, 'order_number', v_number,
    'subtotal', v_subtotal, 'total', v_subtotal, 'items', v_items);
end $$;

revoke all on function public.create_order(jsonb, jsonb) from public;
grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Aplica (sinal -1) ou devolve (sinal +1) o estoque de um pedido.
-- Bloqueia as linhas em ordem determinística para evitar deadlocks.
-- Uso interno (não exposto à API).
-- ---------------------------------------------------------------------
create or replace function public._apply_order_stock(p_order_id uuid, p_sign integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r       record;
  v_stock integer;
begin
  perform set_config('app.stock_reason',
    case when p_sign < 0 then 'order_confirmed' else 'order_canceled' end, true);
  perform set_config('app.stock_order_id', p_order_id::text, true);
  perform set_config('app.stock_note', '', true);

  for r in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as qty,
           min(oi.product_name || coalesce(' - ' || oi.variant_name, '')) as label
      from public.order_items oi
     where oi.order_id = p_order_id and oi.product_id is not null
     group by oi.product_id, oi.variant_id
     order by oi.product_id, oi.variant_id nulls first
  loop
    if r.variant_id is not null then
      select stock into v_stock from public.product_variants where id = r.variant_id for update;
      if not found then continue; end if;            -- variação excluída
      if p_sign < 0 and v_stock < r.qty then
        raise exception 'Estoque insuficiente para "%": disponível %, pedido %.', r.label, v_stock, r.qty
          using errcode = 'P0001';
      end if;
      update public.product_variants set stock = stock + p_sign * r.qty where id = r.variant_id;
    else
      select stock into v_stock from public.products where id = r.product_id for update;
      if not found then continue; end if;            -- produto excluído
      if p_sign < 0 and v_stock < r.qty then
        raise exception 'Estoque insuficiente para "%": disponível %, pedido %.', r.label, v_stock, r.qty
          using errcode = 'P0001';
      end if;
      update public.products set stock = stock + p_sign * r.qty where id = r.product_id;
    end if;
  end loop;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order_id', '', true);
end $$;

revoke all on function public._apply_order_stock(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- admin_update_order_status
--   pending   → confirmed | shipped | completed | canceled
--   confirmed → shipped | completed | canceled
--   shipped   → completed | canceled
--   completed / canceled → (final)
-- Sair de "pending" baixa o estoque; cancelar devolve o que foi baixado.
-- ---------------------------------------------------------------------
create or replace function public.admin_update_order_status(
  p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  if v_order.status = p_status then
    return v_order;
  end if;

  if v_order.status in ('completed', 'canceled')
     or (v_order.status = 'confirmed' and p_status = 'pending')
     or (v_order.status = 'shipped' and p_status in ('pending', 'confirmed')) then
    raise exception 'Não é possível mudar o pedido de "%" para "%".', v_order.status, p_status
      using errcode = 'P0001';
  end if;

  if p_status = 'canceled' then
    if v_order.stock_applied then
      perform public._apply_order_stock(v_order.id, 1);
    end if;
    update public.orders set status = p_status, stock_applied = false
     where id = v_order.id returning * into v_order;
  else
    if not v_order.stock_applied then
      perform public._apply_order_stock(v_order.id, -1);
    end if;
    update public.orders set status = p_status, stock_applied = true
     where id = v_order.id returning * into v_order;
  end if;

  return v_order;
end $$;

revoke all on function public.admin_update_order_status(uuid, public.order_status) from public, anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status) to authenticated;

-- ---------------------------------------------------------------------
-- admin_adjust_stock — entrada/saída manual com observação
-- ---------------------------------------------------------------------
create or replace function public.admin_adjust_stock(
  p_product_id uuid, p_variant_id uuid, p_change integer, p_note text default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_change is null or p_change = 0 then
    raise exception 'Informe uma quantidade diferente de zero.' using errcode = 'P0001';
  end if;

  perform set_config('app.stock_reason', 'manual_adjust', true);
  perform set_config('app.stock_note', coalesce(left(p_note, 300), ''), true);

  if p_variant_id is not null then
    select stock into v_stock from public.product_variants
     where id = p_variant_id and product_id = p_product_id for update;
    if not found then raise exception 'Variação não encontrada.' using errcode = 'P0001'; end if;
    if v_stock + p_change < 0 then
      raise exception 'O estoque não pode ficar negativo (atual: %).', v_stock using errcode = 'P0001';
    end if;
    update public.product_variants set stock = stock + p_change
     where id = p_variant_id returning stock into v_stock;
  else
    select stock into v_stock from public.products where id = p_product_id for update;
    if not found then raise exception 'Produto não encontrado.' using errcode = 'P0001'; end if;
    if v_stock + p_change < 0 then
      raise exception 'O estoque não pode ficar negativo (atual: %).', v_stock using errcode = 'P0001';
    end if;
    update public.products set stock = stock + p_change
     where id = p_product_id returning stock into v_stock;
  end if;

  perform set_config('app.stock_note', '', true);
  return v_stock;
end $$;

revoke all on function public.admin_adjust_stock(uuid, uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_stock(uuid, uuid, integer, text) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 003_rls.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 003_rls.sql — Row Level Security
-- Visitante (anon): lê apenas dados públicos ativos; cria pedidos
--   SOMENTE pela função create_order (não há INSERT direto).
-- Administrador (registrado em public.admins): acesso total.
-- =====================================================================

alter table public.admins           enable row level security;
alter table public.store_settings   enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.product_images   enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.stock_movements  enable row level security;

-- Remove políticas antigas (permite reexecutar o script)
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('admins','store_settings','categories','products','product_images',
                                'product_variants','orders','order_items','stock_movements')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- admins: cada usuário vê apenas o próprio registro. Inclusão de novos
-- administradores é feita pelo SQL Editor (fora da API).
create policy admins_select_self on public.admins
  for select to authenticated using (user_id = auth.uid());

-- store_settings: leitura pública; alteração só admin
create policy settings_public_read on public.store_settings
  for select to anon, authenticated using (true);
create policy settings_admin_update on public.store_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- categories
create policy categories_public_read on public.categories
  for select to anon, authenticated using (is_active or public.is_admin());
create policy categories_admin_insert on public.categories
  for insert to authenticated with check (public.is_admin());
create policy categories_admin_update on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_admin_delete on public.categories
  for delete to authenticated using (public.is_admin());

-- products
create policy products_public_read on public.products
  for select to anon, authenticated using (is_active or public.is_admin());
create policy products_admin_insert on public.products
  for insert to authenticated with check (public.is_admin());
create policy products_admin_update on public.products
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_admin_delete on public.products
  for delete to authenticated using (public.is_admin());

-- product_images (visíveis se o produto for visível)
create policy images_public_read on public.product_images
  for select to anon, authenticated using (
    public.is_admin() or exists (
      select 1 from public.products p where p.id = product_id and p.is_active));
create policy images_admin_insert on public.product_images
  for insert to authenticated with check (public.is_admin());
create policy images_admin_update on public.product_images
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy images_admin_delete on public.product_images
  for delete to authenticated using (public.is_admin());

-- product_variants
create policy variants_public_read on public.product_variants
  for select to anon, authenticated using (
    public.is_admin() or (is_active and exists (
      select 1 from public.products p where p.id = product_id and p.is_active)));
create policy variants_admin_insert on public.product_variants
  for insert to authenticated with check (public.is_admin());
create policy variants_admin_update on public.product_variants
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy variants_admin_delete on public.product_variants
  for delete to authenticated using (public.is_admin());

-- orders / order_items: nenhum acesso público direto.
-- Criação via create_order(); mudança de status via admin_update_order_status().
create policy orders_admin_read on public.orders
  for select to authenticated using (public.is_admin());
create policy orders_admin_update on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Exclusão apenas de pedidos que não movimentaram estoque
create policy orders_admin_delete on public.orders
  for delete to authenticated using (public.is_admin() and not stock_applied);

create policy order_items_admin_read on public.order_items
  for select to authenticated using (public.is_admin());

-- stock_movements: somente leitura para admin (gravação apenas por trigger)
create policy stock_mov_admin_read on public.stock_movements
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------
-- Privilégios de tabela (camada extra além do RLS)
-- ---------------------------------------------------------------------
revoke all on public.admins, public.store_settings, public.categories, public.products,
              public.product_images, public.product_variants, public.orders,
              public.order_items, public.stock_movements from anon, authenticated;

grant select on public.store_settings, public.categories, public.products,
                public.product_images, public.product_variants to anon, authenticated;

grant select on public.admins to authenticated;
grant update on public.store_settings to authenticated;
grant insert, update, delete on public.categories, public.products,
                               public.product_images, public.product_variants to authenticated;
grant select, delete on public.orders to authenticated;
-- Status e estoque do pedido só mudam pela função; o admin edita apenas observações.
grant update (admin_notes) on public.orders to authenticated;
grant select on public.order_items, public.stock_movements to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 004_storage.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 004_storage.sql — Bucket público de imagens (produtos, logo, banner)
-- Leitura pública; envio/alteração/exclusão somente administradores.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880,
        array['image/webp', 'image/jpeg', 'image/png', 'image/avif', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists media_public_read  on storage.objects;
drop policy if exists media_admin_insert on storage.objects;
drop policy if exists media_admin_update on storage.objects;
drop policy if exists media_admin_delete on storage.objects;

create policy media_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');
create policy media_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());
create policy media_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'media' and public.is_admin());


-- >>>>>>>>>>>>>>>>>>>> 006_admin.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 006_admin.sql — Recursos do painel administrativo (Etapa 2)
-- Execute DEPOIS dos scripts 001 a 004. Pode ser reexecutado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Novos campos
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists min_stock    integer not null default 0,
  add column if not exists is_available boolean not null default true,
  add column if not exists low_stock    boolean not null default false;

do $$ begin
  alter table public.products add constraint products_min_stock_check check (min_stock >= 0);
exception when duplicate_object then null; end $$;

alter table public.store_settings
  add column if not exists meta_description  text,
  add column if not exists show_stock_count  boolean not null default true,
  add column if not exists default_min_stock integer not null default 0;

do $$ begin
  alter table public.store_settings add constraint settings_default_min_stock_check check (default_min_stock >= 0);
exception when duplicate_object then null; end $$;

create index if not exists idx_products_low_stock on public.products (low_stock) where low_stock;

-- ---------------------------------------------------------------------
-- Integridade
--  * categoria com produtos não pode ser excluída
--  * excluir uma variação preserva o histórico de estoque do produto
-- ---------------------------------------------------------------------
alter table public.products drop constraint if exists products_category_id_fkey;
alter table public.products add constraint products_category_id_fkey
  foreign key (category_id) references public.categories(id) on delete restrict;

alter table public.stock_movements drop constraint if exists stock_movements_variant_id_fkey;
alter table public.stock_movements add constraint stock_movements_variant_id_fkey
  foreign key (variant_id) references public.product_variants(id) on delete set null;

-- ---------------------------------------------------------------------
-- Campos calculados (agora com estoque baixo)
-- Estoque baixo: estoque mínimo > 0, ainda há unidades e o produto
-- (ou alguma variação ativa) está no limite mínimo ou abaixo dele.
-- ---------------------------------------------------------------------
create or replace function public.compute_product_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_min   numeric(10,2);
  v_sale  boolean;
  v_stock integer;
  v_low   boolean;
begin
  new.updated_at := now();

  select count(*),
         min(coalesce(v.promo_price, v.price, new.promo_price, new.price)),
         bool_or(coalesce(v.promo_price, case when v.price is null then new.promo_price end) is not null),
         coalesce(sum(v.stock), 0),
         bool_or(v.stock <= new.min_stock)
    into v_count, v_min, v_sale, v_stock, v_low
    from public.product_variants v
   where v.product_id = new.id and v.is_active;

  new.has_variants := v_count > 0;

  if v_count > 0 then
    new.sort_price      := v_min;
    new.on_sale         := coalesce(v_sale, false);
    new.available_stock := v_stock;
    new.low_stock       := new.min_stock > 0 and v_stock > 0 and coalesce(v_low, false);
  else
    new.sort_price      := coalesce(new.promo_price, new.price);
    new.on_sale         := new.promo_price is not null;
    new.available_stock := new.stock;
    new.low_stock       := new.min_stock > 0 and new.stock > 0 and new.stock <= new.min_stock;
  end if;

  new.search_text := lower(extensions.unaccent(
    coalesce(new.name, '') || ' ' || coalesce(new.short_description, '') || ' ' || coalesce(new.sku, '')
  ));
  return new;
end $$;

-- Recalcula todos os produtos existentes
update public.products set updated_at = now();

-- ---------------------------------------------------------------------
-- Preço promocional da variação deve ser menor que o preço dela
-- (ou, se não tiver preço próprio, menor que o preço do produto)
-- ---------------------------------------------------------------------
create or replace function public.validate_variant_price()
returns trigger language plpgsql set search_path = '' as $$
declare v_base numeric(10,2);
begin
  if new.promo_price is not null then
    select coalesce(new.price, p.price) into v_base from public.products p where p.id = new.product_id;
    if new.promo_price >= v_base then
      raise exception 'O preço promocional da variação "%" deve ser menor que o preço normal.', new.name
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_variants_validate_price on public.product_variants;
create trigger trg_variants_validate_price before insert or update on public.product_variants
  for each row execute function public.validate_variant_price();

-- ---------------------------------------------------------------------
-- Produto marcado como indisponível não pode ser pedido
-- (verificado em todo item inserido por create_order)
-- ---------------------------------------------------------------------
create or replace function public.check_item_available()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.products p where p.id = new.product_id and not p.is_available) then
    raise exception '"%" está indisponível no momento.', new.product_name using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_order_items_available on public.order_items;
create trigger trg_order_items_available before insert on public.order_items
  for each row execute function public.check_item_available();

-- ---------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'total',          count(*),
      'published',      count(*) filter (where is_active),
      'drafts',         count(*) filter (where not is_active),
      'available',      count(*) filter (where is_active and is_available and available_stock > 0),
      'sold_out',       count(*) filter (where available_stock = 0),
      'low_stock',      count(*) filter (where low_stock),
      'on_sale',        count(*) filter (where on_sale),
      'featured',       count(*) filter (where is_featured),
      'pending_orders', (select count(*) from public.orders o where o.status = 'pending'),
      'categories',     (select count(*) from public.categories)
    )
    from public.products
  );
end $$;

revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- Duplicar produto (cópia em rascunho, estoque zerado)
-- ---------------------------------------------------------------------
create or replace function public.admin_duplicate_product(p_product_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_src  public.products%rowtype;
  v_id   uuid;
  v_slug text;
  v_n    integer := 1;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_src from public.products where id = p_product_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;

  loop
    v_slug := left(v_src.slug, 180) || '-copia' || case when v_n > 1 then '-' || v_n else '' end;
    exit when not exists (select 1 from public.products where slug = v_slug);
    v_n := v_n + 1;
  end loop;

  insert into public.products (category_id, name, slug, short_description, description, indications,
    benefits, features, additional_info, price, promo_price, sku, stock, min_stock,
    is_active, is_featured, is_available)
  values (v_src.category_id, left(v_src.name || ' (cópia)', 150), v_slug, v_src.short_description,
    v_src.description, v_src.indications, v_src.benefits, v_src.features, v_src.additional_info,
    v_src.price, v_src.promo_price, null, 0, v_src.min_stock, false, v_src.is_featured, v_src.is_available)
  returning id into v_id;

  insert into public.product_images (product_id, url, storage_path, alt, sort_order)
  select v_id, url, storage_path, alt, sort_order from public.product_images where product_id = p_product_id;

  insert into public.product_variants (product_id, name, options, sku, price, promo_price, stock, is_active, sort_order)
  select v_id, name, options, null, price, promo_price, 0, is_active, sort_order
    from public.product_variants where product_id = p_product_id;

  return v_id;
end $$;

revoke all on function public.admin_duplicate_product(uuid) from public, anon;
grant execute on function public.admin_duplicate_product(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Reordenação (categorias e imagens) em uma única transação
-- ---------------------------------------------------------------------
create or replace function public.admin_reorder_categories(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  update public.categories c set sort_order = t.ord - 1
    from unnest(p_ids) with ordinality as t(id, ord)
   where c.id = t.id;
end $$;

revoke all on function public.admin_reorder_categories(uuid[]) from public, anon;
grant execute on function public.admin_reorder_categories(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Importação de produtos (CSV já validado no painel)
-- Cada item de p_rows pode conter:
--   id (atualiza) | name, slug, category_id, short_description, description,
--   indications, benefits, features, additional_info, price, promo_price,
--   sku, stock, min_stock, is_active, is_featured, is_available, image_urls[],
--   _line (número da linha no arquivo, usado nas mensagens de erro)
-- Na atualização, só os campos PRESENTES no item são alterados.
-- Tudo ocorre em uma transação: qualquer erro cancela a importação inteira.
-- Retorna {"created": n, "updated": n}.
-- ---------------------------------------------------------------------
create or replace function public.admin_import_products(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r          jsonb;
  i          integer := 0;
  v_id       uuid;
  v_cur      public.products%rowtype;
  v_created  integer := 0;
  v_updated  integer := 0;
  v_url      text;
  v_next     integer;
  v_delta    integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Nenhuma linha para importar.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'Máximo de 2000 linhas por importação.' using errcode = 'P0001';
  end if;

  perform set_config('app.stock_reason', 'manual_adjust', true);
  perform set_config('app.stock_note', 'Importação CSV', true);

  for r in select * from jsonb_array_elements(p_rows) loop
    i := coalesce((r->>'_line')::integer, i + 1);
    begin
      if nullif(r->>'id', '') is not null then
        -- Atualização
        select * into v_cur from public.products where id = (r->>'id')::uuid for update;
        if not found then
          raise exception 'produto com ID % não encontrado', r->>'id';
        end if;

        update public.products p set
          name              = case when r ? 'name'              then r->>'name' else p.name end,
          slug              = case when r ? 'slug'              then r->>'slug' else p.slug end,
          category_id       = case when r ? 'category_id'       then nullif(r->>'category_id', '')::uuid else p.category_id end,
          short_description = case when r ? 'short_description' then r->>'short_description' else p.short_description end,
          description       = case when r ? 'description'       then r->>'description' else p.description end,
          indications       = case when r ? 'indications'       then r->>'indications' else p.indications end,
          benefits          = case when r ? 'benefits'          then r->>'benefits' else p.benefits end,
          features          = case when r ? 'features'          then r->>'features' else p.features end,
          additional_info   = case when r ? 'additional_info'   then r->>'additional_info' else p.additional_info end,
          price             = case when r ? 'price'             then (r->>'price')::numeric else p.price end,
          promo_price       = case when r ? 'promo_price'       then (r->>'promo_price')::numeric else p.promo_price end,
          sku               = case when r ? 'sku'               then r->>'sku' else p.sku end,
          min_stock         = case when r ? 'min_stock'         then (r->>'min_stock')::integer else p.min_stock end,
          is_active         = case when r ? 'is_active'         then (r->>'is_active')::boolean else p.is_active end,
          is_featured       = case when r ? 'is_featured'       then (r->>'is_featured')::boolean else p.is_featured end,
          is_available      = case when r ? 'is_available'      then (r->>'is_available')::boolean else p.is_available end
        where p.id = v_cur.id;

        -- Estoque (apenas produtos sem variações) — registrado no histórico
        if r ? 'stock' and r->>'stock' is not null and not v_cur.has_variants then
          v_delta := (r->>'stock')::integer - v_cur.stock;
          if v_delta <> 0 then
            update public.products set stock = stock + v_delta where id = v_cur.id;
          end if;
        end if;
        v_id := v_cur.id;
        v_updated := v_updated + 1;
      else
        -- Novo produto
        if exists (select 1 from public.products where slug = r->>'slug') then
          raise exception 'já existe um produto com o slug "%" (para atualizar, informe o ID)', r->>'slug';
        end if;
        insert into public.products (name, slug, category_id, short_description, description, indications,
          benefits, features, additional_info, price, promo_price, sku, stock, min_stock,
          is_active, is_featured, is_available)
        values (r->>'name', r->>'slug', nullif(r->>'category_id', '')::uuid, r->>'short_description',
          r->>'description', r->>'indications', r->>'benefits', r->>'features', r->>'additional_info',
          (r->>'price')::numeric, (r->>'promo_price')::numeric, nullif(r->>'sku', ''),
          coalesce((r->>'stock')::integer, 0), coalesce((r->>'min_stock')::integer, 0),
          coalesce((r->>'is_active')::boolean, true), coalesce((r->>'is_featured')::boolean, false),
          coalesce((r->>'is_available')::boolean, true))
        returning id into v_id;
        v_created := v_created + 1;
      end if;

      -- Imagens por URL: adiciona as que ainda não existem (nunca remove)
      if jsonb_typeof(r->'image_urls') = 'array' then
        select coalesce(max(sort_order) + 1, 0) into v_next from public.product_images where product_id = v_id;
        for v_url in select jsonb_array_elements_text(r->'image_urls') loop
          if not exists (select 1 from public.product_images where product_id = v_id and url = v_url) then
            insert into public.product_images (product_id, url, sort_order) values (v_id, v_url, v_next);
            v_next := v_next + 1;
          end if;
        end loop;
      end if;
    exception
      when unique_violation then
        raise exception 'Linha %: SKU ou slug já utilizado por outro produto.', i using errcode = 'P0001';
      when check_violation then
        raise exception 'Linha %: valor inválido (verifique preços, estoque e slug).', i using errcode = 'P0001';
      when foreign_key_violation then
        raise exception 'Linha %: categoria inexistente.', i using errcode = 'P0001';
      when others then
        raise exception 'Linha %: %', i, sqlerrm using errcode = 'P0001';
    end;
  end loop;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);
  return jsonb_build_object('created', v_created, 'updated', v_updated);
end $$;

revoke all on function public.admin_import_products(jsonb) from public, anon;
grant execute on function public.admin_import_products(jsonb) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 007_orders_stock.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 007_orders_stock.sql — Estoque, pedidos e checkout (Etapa 3)
-- Execute DEPOIS do 006_admin.sql. Pode ser reexecutado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Status dos pedidos: "shipped" passa a ser "preparing" (Em preparação)
--   pending   = Aguardando confirmação
--   confirmed = Confirmado (estoque descontado)
--   preparing = Em preparação
--   completed = Finalizado
--   canceled  = Cancelado
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.typname = 'order_status' and e.enumlabel = 'shipped') then
    alter type public.order_status rename value 'shipped' to 'preparing';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Pedidos: cidade, bairro, telefone opcional, datas de controle e busca
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists customer_city         text,
  add column if not exists customer_neighborhood text,
  add column if not exists confirmed_at          timestamptz,
  add column if not exists canceled_at           timestamptz,
  add column if not exists stock_reversed_at     timestamptz,
  add column if not exists search_text           text not null default '';

alter table public.orders alter column customer_phone drop not null;
alter table public.orders drop constraint if exists orders_customer_phone_check;
alter table public.orders add constraint orders_customer_phone_check
  check (customer_phone is null or customer_phone ~ '^[0-9]{10,15}$');

create or replace function public.compute_order_search()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.search_text := lower(extensions.unaccent(
    new.order_number::text || ' ' || coalesce(new.customer_name, '') || ' ' ||
    coalesce(new.customer_phone, '') || ' ' || coalesce(new.customer_city, '') || ' ' ||
    coalesce(new.customer_neighborhood, '')));
  return new;
end $$;

drop trigger if exists trg_orders_search on public.orders;
create trigger trg_orders_search before insert or update on public.orders
  for each row execute function public.compute_order_search();

update public.orders set search_text = search_text;  -- preenche pedidos existentes
create index if not exists idx_orders_created on public.orders (created_at desc);
create index if not exists idx_orders_search_trgm on public.orders using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- Movimentações: tipo (texto), estoque anterior e e-mail do responsável
--   initial         Estoque inicial (cadastro)
--   stock_in        Entrada (adicionar estoque)
--   stock_out       Saída (retirar estoque: perda, avaria, uso interno...)
--   manual_sale     Venda registrada manualmente (fora do site)
--   manual_adjust   Ajuste manual / correção de inventário
--   order_confirmed Baixa por pedido confirmado
--   order_reversed  Estorno de pedido cancelado
-- ---------------------------------------------------------------------
alter table public.stock_movements alter column reason type text using reason::text;
update public.stock_movements set reason = 'order_reversed' where reason = 'order_canceled';
update public.stock_movements set reason = 'initial' where reason = 'manual_adjust' and note = 'Estoque inicial';
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check check (reason in
  ('initial', 'stock_in', 'stock_out', 'manual_sale', 'manual_adjust', 'order_confirmed', 'order_reversed'));
drop type if exists public.stock_reason;

alter table public.stock_movements
  add column if not exists stock_before     integer,
  add column if not exists created_by_email text;
update public.stock_movements set stock_before = stock_after - quantity_change where stock_before is null;
update public.stock_movements m set created_by_email = u.email
  from auth.users u where u.id = m.created_by and m.created_by_email is null;

create index if not exists idx_stock_mov_created on public.stock_movements (created_at desc);
create index if not exists idx_stock_mov_reason  on public.stock_movements (reason, created_at desc);

create or replace function public.log_stock_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old     integer := case when tg_op = 'INSERT' then 0 else old.stock end;
  v_delta   integer := new.stock - v_old;
  v_reason  text;
  v_variant uuid;
  v_product uuid;
begin
  if v_delta = 0 then
    return null;
  end if;
  v_reason := coalesce(nullif(current_setting('app.stock_reason', true), ''),
                       case when tg_op = 'INSERT' then 'initial' else 'manual_adjust' end);
  if tg_table_name = 'product_variants' then
    v_product := new.product_id; v_variant := new.id;
  else
    v_product := new.id; v_variant := null;
  end if;

  insert into public.stock_movements
    (product_id, variant_id, order_id, quantity_change, stock_before, stock_after, reason, note,
     created_by, created_by_email)
  values
    (v_product, v_variant, nullif(current_setting('app.stock_order_id', true), '')::uuid,
     v_delta, v_old, new.stock, v_reason,
     coalesce(nullif(current_setting('app.stock_note', true), ''), case when tg_op = 'INSERT' then 'Estoque inicial' end),
     auth.uid(), (select u.email from auth.users u where u.id = auth.uid()));
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Estoque mínimo por variação (vazio = usa o mínimo do produto)
-- ---------------------------------------------------------------------
alter table public.product_variants add column if not exists min_stock integer;
do $$ begin
  alter table public.product_variants add constraint product_variants_min_stock_check
    check (min_stock is null or min_stock >= 0);
exception when duplicate_object then null; end $$;

create or replace function public.compute_product_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_min   numeric(10,2);
  v_sale  boolean;
  v_stock integer;
  v_low   boolean;
begin
  new.updated_at := now();

  select count(*),
         min(coalesce(v.promo_price, v.price, new.promo_price, new.price)),
         bool_or(coalesce(v.promo_price, case when v.price is null then new.promo_price end) is not null),
         coalesce(sum(v.stock), 0),
         bool_or(coalesce(v.min_stock, new.min_stock) > 0 and v.stock <= coalesce(v.min_stock, new.min_stock))
    into v_count, v_min, v_sale, v_stock, v_low
    from public.product_variants v
   where v.product_id = new.id and v.is_active;

  new.has_variants := v_count > 0;

  if v_count > 0 then
    new.sort_price      := v_min;
    new.on_sale         := coalesce(v_sale, false);
    new.available_stock := v_stock;
    new.low_stock       := v_stock > 0 and coalesce(v_low, false);
  else
    new.sort_price      := coalesce(new.promo_price, new.price);
    new.on_sale         := new.promo_price is not null;
    new.available_stock := new.stock;
    new.low_stock       := new.min_stock > 0 and new.stock > 0 and new.stock <= new.min_stock;
  end if;

  new.search_text := lower(extensions.unaccent(
    coalesce(new.name, '') || ' ' || coalesce(new.short_description, '') || ' ' || coalesce(new.sku, '')
  ));
  return new;
end $$;

update public.products set updated_at = now();

-- ---------------------------------------------------------------------
-- quote_cart — preços e disponibilidade ATUAIS dos itens do carrinho.
-- Usado pela loja para revalidar o carrinho antes do checkout.
-- p_items: [{"product_id","variant_id"}]
-- ---------------------------------------------------------------------
create or replace function public.quote_cart(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r      jsonb;
  v_out  jsonb := '[]'::jsonb;
  p      public.products%rowtype;
  v      public.product_variants%rowtype;
  v_img  text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50 then
    raise exception 'Carrinho inválido.' using errcode = 'P0001';
  end if;
  for r in select * from jsonb_array_elements(p_items) loop
    select * into p from public.products where id = (r->>'product_id')::uuid and is_active;
    if not found then
      v_out := v_out || jsonb_build_object('product_id', r->>'product_id', 'variant_id', r->>'variant_id', 'status', 'removed');
      continue;
    end if;
    select url into v_img from public.product_images where product_id = p.id order by sort_order limit 1;
    if nullif(r->>'variant_id', '') is not null then
      select * into v from public.product_variants
       where id = (r->>'variant_id')::uuid and product_id = p.id and is_active;
      if not found then
        v_out := v_out || jsonb_build_object('product_id', p.id, 'variant_id', r->>'variant_id', 'status', 'removed', 'name', p.name);
        continue;
      end if;
      v_out := v_out || jsonb_build_object(
        'product_id', p.id, 'variant_id', v.id, 'name', p.name, 'variant_name', v.name, 'slug', p.slug, 'image', v_img,
        'unit_price', coalesce(v.promo_price, v.price, p.promo_price, p.price), 'stock', v.stock,
        'status', case when not p.is_available then 'unavailable' when v.stock <= 0 then 'sold_out' else 'ok' end);
    else
      v_out := v_out || jsonb_build_object(
        'product_id', p.id, 'variant_id', null, 'name', p.name, 'variant_name', null, 'slug', p.slug, 'image', v_img,
        'unit_price', coalesce(p.promo_price, p.price), 'stock', p.stock,
        'status', case when p.has_variants then 'removed' when not p.is_available then 'unavailable'
                       when p.stock <= 0 then 'sold_out' else 'ok' end);
    end if;
  end loop;
  return v_out;
end $$;

revoke all on function public.quote_cart(jsonb) from public;
grant execute on function public.quote_cart(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- create_order — registra o pedido (status "Aguardando confirmação").
-- Preços e disponibilidade são recalculados aqui; nada vem do navegador
-- além de IDs e quantidades. NÃO desconta estoque nem reserva unidades.
--
-- p_customer: {"name","phone"(opcional),"city","neighborhood","address"(opcional),"notes"(opcional)}
-- p_items:    [{"product_id","variant_id"(opcional),"quantity"}]
-- ---------------------------------------------------------------------
create or replace function public.create_order(p_customer jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name     text := btrim(coalesce(p_customer->>'name', ''));
  v_phone    text := nullif(regexp_replace(coalesce(p_customer->>'phone', ''), '\D', '', 'g'), '');
  v_city     text := btrim(coalesce(p_customer->>'city', ''));
  v_hood     text := btrim(coalesce(p_customer->>'neighborhood', ''));
  v_address  text := nullif(btrim(coalesce(p_customer->>'address', '')), '');
  v_notes    text := nullif(btrim(coalesce(p_customer->>'notes', '')), '');
  v_order    public.orders%rowtype;
  v_subtotal numeric(10,2) := 0;
  v_items    jsonb := '[]'::jsonb;
  r          record;
  v_product  public.products%rowtype;
  v_variant  public.product_variants%rowtype;
  v_price    numeric(10,2);
  v_stock    integer;
  v_vname    text;
  v_sku      text;
  v_label    text;
  v_problems text[] := '{}';
begin
  -- Cliente
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Informe seu nome.' using errcode = 'P0001';
  end if;
  if v_phone is not null then
    if char_length(v_phone) in (10, 11) then v_phone := '55' || v_phone; end if;
    if v_phone !~ '^[0-9]{12,15}$' then
      raise exception 'Telefone inválido. Informe DDD + número.' using errcode = 'P0001';
    end if;
  end if;
  if char_length(v_city) < 2 or char_length(v_city) > 80 then
    raise exception 'Informe sua cidade.' using errcode = 'P0001';
  end if;
  if char_length(v_hood) < 2 or char_length(v_hood) > 80 then
    raise exception 'Informe seu bairro.' using errcode = 'P0001';
  end if;
  if v_address is not null and char_length(v_address) > 300 then
    raise exception 'Endereço muito longo (máx. 300 caracteres).' using errcode = 'P0001';
  end if;
  if v_notes is not null and char_length(v_notes) > 1000 then
    raise exception 'Observações muito longas (máx. 1000 caracteres).' using errcode = 'P0001';
  end if;

  -- Itens
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'O carrinho está vazio ou possui itens demais.' using errcode = 'P0001';
  end if;

  -- Proteção básica contra abuso (sem reservar estoque)
  if v_phone is not null and (select count(*) from public.orders o where o.customer_phone = v_phone
       and o.status = 'pending' and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos recentes com este telefone. Aguarde o contato da loja.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders o where o.created_at > now() - interval '5 minutes') >= 60 then
    raise exception 'Muitos pedidos no momento. Tente novamente em alguns minutos.' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_name, customer_phone, customer_city, customer_neighborhood,
                             delivery_address, customer_notes, subtotal, total)
  values (v_name, v_phone, v_city, v_hood, v_address, v_notes, 0, 0)
  returning * into v_order;

  for r in
    select (e->>'product_id')::uuid as product_id,
           nullif(e->>'variant_id', '')::uuid as variant_id,
           sum((e->>'quantity')::integer) as quantity,
           min(ord) as ord
      from jsonb_array_elements(p_items) with ordinality as t(e, ord)
     group by 1, 2
     order by min(ord)
  loop
    if r.product_id is null or r.quantity is null or r.quantity < 1 or r.quantity > 999 then
      raise exception 'Item inválido no carrinho.' using errcode = 'P0001';
    end if;

    select * into v_product from public.products p where p.id = r.product_id and p.is_active;
    if not found then
      v_problems := v_problems || 'Um dos produtos não está mais disponível na loja.'; continue;
    end if;

    if v_product.has_variants then
      if r.variant_id is null then
        v_problems := v_problems || format('Selecione uma opção para "%s".', v_product.name); continue;
      end if;
      select * into v_variant from public.product_variants v
       where v.id = r.variant_id and v.product_id = v_product.id and v.is_active;
      if not found then
        v_problems := v_problems || format('A opção escolhida de "%s" não está mais disponível.', v_product.name); continue;
      end if;
      v_price := coalesce(v_variant.promo_price, v_variant.price, v_product.promo_price, v_product.price);
      v_stock := v_variant.stock; v_vname := v_variant.name; v_sku := coalesce(v_variant.sku, v_product.sku);
    else
      if r.variant_id is not null then
        v_problems := v_problems || format('"%s" foi alterado. Remova-o e adicione novamente.', v_product.name); continue;
      end if;
      v_price := coalesce(v_product.promo_price, v_product.price);
      v_stock := v_product.stock; v_vname := null; v_sku := v_product.sku;
    end if;

    v_label := v_product.name || coalesce(' (' || v_vname || ')', '');
    if not v_product.is_available then
      v_problems := v_problems || format('"%s" está indisponível no momento.', v_label); continue;
    end if;
    if v_stock <= 0 then
      v_problems := v_problems || format('"%s" está esgotado.', v_label); continue;
    end if;
    if v_stock < r.quantity then
      v_problems := v_problems || format('Restam apenas %s unidade(s) de "%s".', v_stock, v_label); continue;
    end if;

    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name,
                                    sku, unit_price, quantity, line_total)
    values (v_order.id, v_product.id, r.variant_id, v_product.name, v_vname,
            v_sku, v_price, r.quantity, v_price * r.quantity);

    v_subtotal := v_subtotal + v_price * r.quantity;
    v_items := v_items || jsonb_build_object(
      'product_name', v_product.name, 'variant_name', v_vname, 'sku', v_sku,
      'unit_price', v_price, 'quantity', r.quantity, 'line_total', v_price * r.quantity);
  end loop;

  -- Qualquer problema cancela o registro inteiro e lista todos os itens a corrigir
  if array_length(v_problems, 1) > 0 then
    raise exception '%', array_to_string(v_problems, E'\n') using errcode = 'P0001',
      hint = 'cart_problems';
  end if;

  update public.orders set subtotal = v_subtotal, total = v_subtotal
   where id = v_order.id returning * into v_order;

  return jsonb_build_object(
    'id', v_order.id, 'order_number', v_order.order_number, 'created_at', v_order.created_at,
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone, 'city', v_city,
                                   'neighborhood', v_hood, 'address', v_address, 'notes', v_notes),
    'subtotal', v_subtotal, 'total', v_subtotal, 'items', v_items);
end $$;

revoke all on function public.create_order(jsonb, jsonb) from public;
grant execute on function public.create_order(jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Aplica (sinal -1, baixa) ou devolve (sinal +1, estorno) o estoque de um
-- pedido. Trava TODAS as linhas envolvidas em ordem fixa (evita deadlock),
-- confere a disponibilidade de todos os itens e só então altera.
-- Se faltar estoque, lista todos os itens que precisam de ajuste.
-- ---------------------------------------------------------------------
create or replace function public._apply_order_stock(p_order_id uuid, p_sign integer)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r          record;
  v_stock    integer;
  v_missing  text[] := '{}';
begin
  -- 1) trava e confere
  for r in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as qty,
           min(oi.product_name || coalesce(' (' || oi.variant_name || ')', '')) as label
      from public.order_items oi
     where oi.order_id = p_order_id and oi.product_id is not null
     group by oi.product_id, oi.variant_id
     order by oi.product_id, oi.variant_id nulls first
  loop
    if r.variant_id is not null then
      select stock into v_stock from public.product_variants where id = r.variant_id for update;
    else
      select stock into v_stock from public.products where id = r.product_id for update;
    end if;
    if not found then
      if p_sign < 0 then v_missing := v_missing || format('%s: produto/opção foi excluído', r.label); end if;
    elsif p_sign < 0 and v_stock < r.qty then
      v_missing := v_missing || format('%s: disponível %s, pedido %s', r.label, v_stock, r.qty);
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Estoque insuficiente para confirmar o pedido. Ajuste os itens:%', E'\n• ' || array_to_string(v_missing, E'\n• ')
      using errcode = 'P0001', hint = 'stock_shortage';
  end if;

  -- 2) altera (as movimentações são registradas pelo trigger)
  perform set_config('app.stock_reason', case when p_sign < 0 then 'order_confirmed' else 'order_reversed' end, true);
  perform set_config('app.stock_order_id', p_order_id::text, true);
  perform set_config('app.stock_note', (select case when p_sign < 0 then 'Pedido #' else 'Estorno do pedido #' end
                                               || order_number from public.orders where id = p_order_id), true);
  for r in
    select oi.product_id, oi.variant_id, sum(oi.quantity)::integer as qty
      from public.order_items oi
     where oi.order_id = p_order_id and oi.product_id is not null
     group by oi.product_id, oi.variant_id
     order by oi.product_id, oi.variant_id nulls first
  loop
    if r.variant_id is not null then
      update public.product_variants set stock = stock + p_sign * r.qty where id = r.variant_id;
    else
      update public.products set stock = stock + p_sign * r.qty where id = r.product_id;
    end if;
  end loop;

  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_order_id', '', true);
  perform set_config('app.stock_note', '', true);
end $$;

revoke all on function public._apply_order_stock(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- admin_update_order_status
--   pending              → confirmed (baixa o estoque) | canceled
--   confirmed            → preparing | completed | canceled
--   preparing            → completed | canceled
--   completed            → canceled (devolução)
--   canceled             → (final)
-- Ao cancelar um pedido já descontado, p_reverse_stock = true devolve as
-- unidades na mesma transação; caso contrário o estorno fica disponível
-- depois em admin_reverse_order_stock.
-- Repetir a mesma ação (clique duplo / página desatualizada) não tem efeito.
-- ---------------------------------------------------------------------
drop function if exists public.admin_update_order_status(uuid, public.order_status);

create or replace function public.admin_update_order_status(
  p_order_id uuid, p_status public.order_status, p_reverse_stock boolean default false)
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ok    boolean;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status = p_status then
    return v_order;                                   -- idempotente
  end if;

  v_ok := case v_order.status
    when 'pending'   then p_status in ('confirmed', 'canceled')
    when 'confirmed' then p_status in ('preparing', 'completed', 'canceled')
    when 'preparing' then p_status in ('completed', 'canceled')
    when 'completed' then p_status = 'canceled'
    else false end;
  if not v_ok then
    raise exception 'Não é possível alterar o pedido #% de "%" para "%".',
      v_order.order_number, v_order.status, p_status using errcode = 'P0001';
  end if;

  if p_status = 'confirmed' and not v_order.stock_applied then
    perform public._apply_order_stock(v_order.id, -1);
    update public.orders set status = p_status, stock_applied = true, confirmed_at = now()
     where id = v_order.id returning * into v_order;
  elsif p_status = 'canceled' then
    if v_order.stock_applied and p_reverse_stock then
      perform public._apply_order_stock(v_order.id, 1);
      update public.orders set status = p_status, canceled_at = now(), stock_applied = false, stock_reversed_at = now()
       where id = v_order.id returning * into v_order;
    else
      update public.orders set status = p_status, canceled_at = now()
       where id = v_order.id returning * into v_order;
    end if;
  else
    update public.orders set status = p_status where id = v_order.id returning * into v_order;
  end if;
  return v_order;
end $$;

revoke all on function public.admin_update_order_status(uuid, public.order_status, boolean) from public, anon;
grant execute on function public.admin_update_order_status(uuid, public.order_status, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- admin_reverse_order_stock — estorno de pedido cancelado já descontado.
-- Só pode ocorrer uma vez por pedido.
-- ---------------------------------------------------------------------
create or replace function public.admin_reverse_order_stock(p_order_id uuid)
returns public.orders
language plpgsql security definer
set search_path = ''
as $$
declare v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'canceled' then
    raise exception 'Cancele o pedido antes de estornar o estoque.' using errcode = 'P0001';
  end if;
  if not v_order.stock_applied then
    raise exception 'O estoque do pedido #% não está descontado (já estornado ou nunca confirmado).',
      v_order.order_number using errcode = 'P0001';
  end if;
  perform public._apply_order_stock(v_order.id, 1);
  update public.orders set stock_applied = false, stock_reversed_at = now()
   where id = v_order.id returning * into v_order;
  return v_order;
end $$;

revoke all on function public.admin_reverse_order_stock(uuid) from public, anon;
grant execute on function public.admin_reverse_order_stock(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- admin_check_order_stock — situação atual do estoque para cada item
-- (avisa o administrador se algo acabou antes da confirmação)
-- ---------------------------------------------------------------------
create or replace function public.admin_check_order_stock(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'item_id', oi.id, 'quantity', oi.quantity,
      'available', case when oi.variant_id is not null then v.stock when oi.product_id is not null then p.stock end,
      'product_exists', p.id is not null and (oi.variant_id is null or v.id is not null),
      'is_available', coalesce(p.is_available, false)) order by oi.created_at)
    from public.order_items oi
    left join public.products p on p.id = oi.product_id
    left join public.product_variants v on v.id = oi.variant_id
    where oi.order_id = p_order_id), '[]'::jsonb);
end $$;

revoke all on function public.admin_check_order_stock(uuid) from public, anon;
grant execute on function public.admin_check_order_stock(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- admin_stock_operation — movimentação manual
--   in   = adicionar (entrada)        out = retirar (perda, avaria...)
--   sale = registrar venda (fora do site)   set = ajustar para a quantidade informada
-- ---------------------------------------------------------------------
create or replace function public.admin_stock_operation(
  p_product_id uuid, p_variant_id uuid, p_type text, p_quantity integer, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_has_variants boolean;
  v_before integer;
  v_after  integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_type not in ('in', 'out', 'sale', 'set') then
    raise exception 'Tipo de movimentação inválido.' using errcode = 'P0001';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'set' and p_quantity = 0) or p_quantity > 1000000 then
    raise exception 'Quantidade inválida.' using errcode = 'P0001';
  end if;
  if p_type in ('out', 'set') and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Informe o motivo da movimentação.' using errcode = 'P0001';
  end if;

  select has_variants into v_has_variants from public.products where id = p_product_id;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0001';
  end if;

  if p_variant_id is not null then
    select stock into v_before from public.product_variants
     where id = p_variant_id and product_id = p_product_id for update;
    if not found then raise exception 'Variação não encontrada.' using errcode = 'P0001'; end if;
  else
    if v_has_variants then
      raise exception 'Este produto tem variações: escolha a variação.' using errcode = 'P0001';
    end if;
    select stock into v_before from public.products where id = p_product_id for update;
  end if;

  v_after := case p_type when 'in' then v_before + p_quantity when 'set' then p_quantity
                         else v_before - p_quantity end;
  if v_after < 0 then
    raise exception 'Estoque insuficiente: há % unidade(s).', v_before using errcode = 'P0001';
  end if;
  if v_after = v_before then
    raise exception 'A quantidade informada é igual ao estoque atual (%).', v_before using errcode = 'P0001';
  end if;

  perform set_config('app.stock_reason', case p_type when 'in' then 'stock_in' when 'out' then 'stock_out'
                                         when 'sale' then 'manual_sale' else 'manual_adjust' end, true);
  perform set_config('app.stock_note', left(coalesce(btrim(p_reason), ''), 300), true);
  if p_variant_id is not null then
    update public.product_variants set stock = v_after where id = p_variant_id;
  else
    update public.products set stock = v_after where id = p_product_id;
  end if;
  perform set_config('app.stock_reason', '', true);
  perform set_config('app.stock_note', '', true);

  return jsonb_build_object('before', v_before, 'after', v_after);
end $$;

revoke all on function public.admin_stock_operation(uuid, uuid, text, integer, text) from public, anon;
grant execute on function public.admin_stock_operation(uuid, uuid, text, integer, text) to authenticated;


-- >>>>>>>>>>>>>>>>>>>> 008_security.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 008_security.sql — Endurecimento de segurança (Etapa 4)
-- Execute DEPOIS do 007. Pode ser reexecutado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Storage
--  * SVG removido dos tipos aceitos (pode conter scripts)
--  * A listagem de arquivos do bucket fica restrita aos administradores.
--    As imagens continuam públicas pelo link direto (bucket público).
-- ---------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/avif'],
       file_size_limit = 5242880
 where id = 'media';

drop policy if exists media_public_read on storage.objects;
drop policy if exists media_admin_read  on storage.objects;
create policy media_admin_read on storage.objects
  for select to authenticated using (bucket_id = 'media' and public.is_admin());

-- ---------------------------------------------------------------------
-- Limites e formatos validados também no banco (não só no navegador).
-- NOT VALID: vale para novas gravações sem bloquear dados já existentes.
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select * from (values
    ('products', 'products_text_lengths', $c$check (
        char_length(coalesce(short_description, '')) <= 300 and char_length(coalesce(description, '')) <= 10000 and
        char_length(coalesce(indications, '')) <= 5000 and char_length(coalesce(benefits, '')) <= 5000 and
        char_length(coalesce(features, '')) <= 5000 and char_length(coalesce(additional_info, '')) <= 5000 and
        char_length(coalesce(sku, '')) <= 60 and char_length(slug) <= 200)$c$),
    ('product_variants', 'variants_text_lengths', $c$check (char_length(coalesce(sku, '')) <= 60 and pg_column_size(options) <= 2000)$c$),
    ('product_images', 'images_url_format', $c$check (url ~* '^https?://' and char_length(url) <= 1000 and char_length(coalesce(alt, '')) <= 200)$c$),
    ('categories', 'categories_fields', $c$check ((image_url is null or image_url ~* '^https?://') and char_length(coalesce(description, '')) <= 1000 and char_length(slug) <= 120)$c$),
    ('store_settings', 'settings_urls', $c$check (
        (logo_url is null or logo_url ~* '^https?://') and (hero_image_url is null or hero_image_url ~* '^https?://') and
        (instagram_url is null or instagram_url ~* '^https?://') and (facebook_url is null or facebook_url ~* '^https?://'))$c$),
    ('store_settings', 'settings_lengths', $c$check (
        char_length(coalesce(tagline, '')) <= 200 and char_length(coalesce(about_text, '')) <= 3000 and
        char_length(coalesce(footer_text, '')) <= 500 and char_length(coalesce(hero_title, '')) <= 120 and
        char_length(coalesce(hero_subtitle, '')) <= 300 and char_length(coalesce(hero_cta_label, '')) <= 40 and
        char_length(coalesce(meta_description, '')) <= 300 and char_length(coalesce(address, '')) <= 300 and
        char_length(coalesce(email, '')) <= 200 and char_length(coalesce(phone, '')) <= 40 and
        char_length(coalesce(business_hours, '')) <= 200)$c$),
    ('orders', 'orders_admin_notes_length', $c$check (char_length(coalesce(admin_notes, '')) <= 2000)$c$)
  ) as t(tbl, name, def)
  loop
    if not exists (select 1 from pg_constraint where conname = c.name) then
      execute format('alter table public.%I add constraint %I %s not valid', c.tbl, c.name, c.def);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funções de trigger não precisam ser executáveis pela API
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;
