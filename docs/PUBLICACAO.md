# Guia de publicação (gratuita)

Este guia coloca a loja no ar usando **GitHub** (código), **Supabase** (banco, login e imagens) e **Cloudflare Pages** (hospedagem). Os três têm plano gratuito suficiente para começar.

> Tempo estimado: 40–60 minutos na primeira vez.
> Os nomes de menus podem mudar um pouco com o tempo; se algo não estiver exatamente no lugar indicado, procure pelo nome da opção.

---

## 1. Contas necessárias

| Serviço | Para quê | Onde criar |
|---|---|---|
| GitHub | Guardar o código e publicar automaticamente | <https://github.com/signup> |
| Supabase | Banco de dados, login do painel e fotos | <https://supabase.com> → *Start your project* (pode entrar com o GitHub) |
| Cloudflare | Hospedar o site | <https://dash.cloudflare.com/sign-up> |

Nenhum deles pede cartão de crédito no plano gratuito.

---

## 2. Repositório no GitHub

O código já está no repositório `cassianoal-1304/genesiscatcare`.

- Mantenha o repositório **privado** se preferir (o Cloudflare funciona com repositórios privados).
- O arquivo `.env` (com as chaves) **não** vai para o GitHub — está no `.gitignore`. Nunca o envie.

---

## 3. Configurar o Supabase

### 3.1 Criar o projeto
1. No Supabase, clique em **New project**.
2. Escolha um nome (ex.: `genesis-cat-care`), crie uma **senha forte do banco** (guarde-a) e a região **South America (São Paulo)**.
3. Aguarde a criação (1–2 minutos).

### 3.2 Criar as tabelas
1. Menu lateral → **SQL Editor** → **New query**.
2. Abra o arquivo `supabase/instalacao_completa.sql` do repositório, copie **todo** o conteúdo, cole e clique em **Run**.
3. Deve aparecer *Success*. (O arquivo pode ser executado de novo sem problemas.)

> Já tem um projeto criado nas etapas anteriores? Em vez do arquivo completo, execute apenas os arquivos de `supabase/migrations/` que ainda não rodou, **em ordem** (006, 007, 008...).

### 3.3 Criar o administrador
1. Menu **Authentication → Users → Add user → Create new user**.
2. Informe seu e-mail e uma senha forte, marque **Auto Confirm User** e crie.
3. Volte ao **SQL Editor**, abra `supabase/migrations/005_create_admin.sql`, troque `SEU-EMAIL@exemplo.com` pelo seu e-mail e execute. O resultado deve mostrar 1 linha com seu e-mail.

Para adicionar outro administrador depois, repita os passos 1–3 com o e-mail da pessoa.

### 3.4 Segurança do login (obrigatório)
Em **Authentication → Sign In / Providers** (ou *Providers → Email*):
- **Desative “Allow new users to sign up”** — ninguém deve conseguir criar conta sozinho.
- Mantenha **“Confirm email”** ativado.

> Mesmo que alguém criasse uma conta, ela não entraria no painel: só os e-mails cadastrados no passo 3.3 têm acesso. Desativar o cadastro é uma camada extra.

### 3.5 Copiar as chaves públicas
Em **Project Settings → API Keys** (ou **Data API**):
- **Project URL** → algo como `https://abcdefgh.supabase.co`
- **Publishable key** (`sb_publishable_...`) ou, em projetos antigos, a chave **anon public** (`eyJ...`)

> ⚠️ **Nunca** use a chave **secret** / **service_role** no site, no Cloudflare ou no GitHub. Ela ignora todas as regras de segurança. O site só precisa da chave pública: quem protege os dados são as políticas (RLS) instaladas no passo 3.2.

---

## 4. Publicar no Cloudflare Pages

1. No Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
2. Autorize o GitHub e escolha o repositório `genesiscatcare`.
3. Configuração de build:
   | Campo | Valor |
   |---|---|
   | Framework preset | `React (Vite)` (ou `None`) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Branch de produção | `main` |
4. Em **Environment variables (advanced)**, adicione:
   | Nome | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | a Project URL do passo 3.5 |
   | `VITE_SUPABASE_ANON_KEY` | a Publishable/anon key do passo 3.5 |
   | `NODE_VERSION` | `22` |
5. Clique em **Save and Deploy**. Em 1–3 minutos o site estará em `https://NOME-DO-PROJETO.pages.dev`.

O projeto já inclui:
- `public/_redirects` — faz as rotas (`/produto/...`, `/admin`...) funcionarem ao recarregar a página;
- `public/_headers` — cabeçalhos de segurança (CSP, proteção contra *clickjacking*, cache dos arquivos);
- `public/robots.txt` — impede que o painel apareça no Google.

> Se o Cloudflare oferecer criar um **Worker** em vez de Pages, as mesmas configurações de build e variáveis funcionam; os arquivos `_redirects` e `_headers` também são respeitados.

---

## 5. Ligar o Supabase ao endereço do site

Necessário para o **“Esqueci minha senha”** funcionar.

Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://NOME-DO-PROJETO.pages.dev` (ou seu domínio)
- **Redirect URLs**: adicione `https://NOME-DO-PROJETO.pages.dev/admin/redefinir-senha`
  (se tiver domínio próprio, adicione também `https://www.seudominio.com.br/admin/redefinir-senha`)

**E-mails:** o envio de e-mails embutido do Supabase tem limite baixo (poucos por hora) e serve para testes. Para uso contínuo da recuperação de senha, configure um SMTP em **Authentication → Emails → SMTP Settings** (há provedores com plano gratuito; verifique os termos atuais).

---

## 6. Primeiro acesso

1. Abra `https://NOME-DO-PROJETO.pages.dev/admin` e entre com o e-mail/senha do passo 3.3.
2. Vá em **Configurações** e preencha nome da loja, **WhatsApp**, logotipo, cores e contatos. **Sem o WhatsApp configurado, a loja não aceita pedidos.**
3. Crie as categorias e cadastre os produtos (veja o [Manual do administrador](MANUAL-ADMIN.md)).
4. Faça um pedido de teste pela loja, confirme e cancele com estorno no painel para ver o fluxo completo.

---

## 7. Domínio próprio (opcional)

1. Registre o domínio (ex.: em <https://registro.br> para `.com.br`).
2. Cloudflare → seu projeto Pages → **Custom domains → Set up a custom domain** → digite `www.seudominio.com.br`.
3. Siga as instruções exibidas:
   - se o domínio usar o DNS do Cloudflare, a configuração é automática;
   - caso contrário, crie no seu provedor de DNS o registro **CNAME** indicado (apontando para `NOME-DO-PROJETO.pages.dev`).
4. O certificado HTTPS é emitido automaticamente.
5. Atualize a **Site URL** e as **Redirect URLs** no Supabase (passo 5) com o novo domínio.

---

## 8. Atualizações futuras

- **Código:** toda alteração enviada (`git push`) para a branch `main` é publicada automaticamente pelo Cloudflare em poucos minutos. Alterações em outras branches geram um endereço de pré-visualização.
- **Banco de dados:** quando uma atualização trouxer um novo arquivo em `supabase/migrations/` (ex.: `009_...sql`), execute **apenas esse arquivo** no SQL Editor, na ordem numérica. Depois rode `npm run sql:bundle` para atualizar o `instalacao_completa.sql`.
- **Voltar uma versão do site:** Cloudflare → projeto → **Deployments** → escolha uma publicação anterior → **Rollback**.
- **Rodar no computador (opcional):**
  ```bash
  npm install
  cp .env.example .env   # preencha as duas variáveis
  npm run dev
  ```

---

## 9. Cuidados com o plano gratuito

- **Supabase pausa projetos gratuitos sem atividade por cerca de 1 semana.** Com a loja recebendo visitas isso normalmente não acontece; se ocorrer, entre no painel do Supabase e clique em **Restore project**.
- O plano gratuito do Supabase **não oferece backups que você possa baixar**. Faça periodicamente a **exportação CSV** dos produtos pelo painel (*Importar / Exportar*) e guarde o arquivo.
- Limites atuais de cada plano: <https://supabase.com/pricing> e <https://www.cloudflare.com/plans/developer-platform/>.
