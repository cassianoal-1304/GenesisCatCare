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
