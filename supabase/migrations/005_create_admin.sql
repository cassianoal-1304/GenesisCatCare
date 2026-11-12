-- =====================================================================
-- 005_create_admin.sql — Promove um usuário a administrador
-- 1) Crie o usuário em Authentication > Users > "Add user"
--    (marque "Auto Confirm User").
-- 2) Troque o e-mail abaixo e execute este script.
-- =====================================================================
insert into public.admins (user_id)
select id from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict (user_id) do nothing;

-- Verificação: deve retornar 1 linha
select a.user_id, u.email from public.admins a join auth.users u on u.id = a.user_id;
