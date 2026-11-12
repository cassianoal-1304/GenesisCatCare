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
