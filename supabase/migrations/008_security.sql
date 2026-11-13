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
