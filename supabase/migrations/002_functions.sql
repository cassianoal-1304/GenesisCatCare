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
