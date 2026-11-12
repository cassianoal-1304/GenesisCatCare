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
