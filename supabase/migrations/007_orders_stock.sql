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
