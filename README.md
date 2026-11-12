# Loja Virtual com checkout pelo WhatsApp

Loja virtual em **React + Vite + TypeScript**, com **Supabase** (banco, autenticação e imagens) e hospedagem no **Cloudflare Pages**.
Não precisa de servidor próprio: as regras de negócio ficam no banco (funções SQL + RLS).

## Status das etapas

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Banco de dados, RLS, loja pública (home, catálogo, produto, carrinho) | ✅ concluída |
| 2 | — | aguardando |
| 3 | — | aguardando |
| 4 | — | aguardando |

## Estrutura

```
supabase/migrations/
  001_schema.sql        tabelas, índices, campos calculados
  002_functions.sql     is_admin, create_order, status do pedido, ajuste de estoque
  003_rls.sql           políticas de segurança (RLS) e privilégios
  004_storage.sql       bucket público "media" para imagens
  005_create_admin.sql  promove um usuário a administrador
src/
  lib/          supabase.ts (cliente), api.ts (consultas), format.ts
  types/        db.ts (tipos das tabelas)
  context/      StoreContext (configurações/categorias), CartContext (carrinho)
  hooks/        useDocumentTitle
  components/
    ui/         Icons, Feedback (carregando/vazio/erro), QuantityInput
    store/      ProductCard, ProductImage, Price, ProductSection
    layout/     Header, Footer, CartDrawer, StoreLayout
  pages/store/  HomePage, CatalogPage, ProductPage, NotFoundPage
public/_redirects  rotas SPA no Cloudflare Pages
```

## 1. Configurar o Supabase

1. Crie um projeto gratuito em <https://supabase.com>.
2. Abra **SQL Editor → New query** e execute, **nesta ordem**, o conteúdo de:
   `001_schema.sql`, `002_functions.sql`, `003_rls.sql`, `004_storage.sql`.
   Os scripts podem ser executados novamente sem duplicar dados.
3. Crie o administrador:
   - **Authentication → Users → Add user** (e-mail e senha, marque *Auto Confirm User*);
   - edite o e-mail em `005_create_admin.sql` e execute-o.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon / publishable**.

> ⚠️ Nunca use a chave `service_role` no frontend nem no Cloudflare. A segurança vem do RLS.

### Como o banco funciona

- **Produtos sem variação** usam `products.stock`. **Com variação** (tamanho, cor, modelo...), o estoque fica em cada `product_variants.stock`.
  Variações podem ter preço próprio; se não tiverem, usam o preço do produto.
- Campos como `sort_price`, `on_sale`, `available_stock`, `has_variants` e `search_text` são **calculados automaticamente** por trigger.
- `benefits` e `features`: **um item por linha** (exibidos como lista).
- **Pedidos**: visitantes não acessam tabelas de pedidos. Eles só podem chamar `create_order()`, que valida os dados e **recalcula preços e disponibilidade no banco**. O pedido nasce como `pending` e **não baixa o estoque**.
- **Estoque**: ao confirmar o pedido (`admin_update_order_status`), o estoque é baixado de forma atômica, com bloqueio de linha. Ao cancelar, ele é devolvido. Sem estoque suficiente, a confirmação é recusada.
- **Toda** alteração de estoque, inclusive edições manuais, gera uma linha em `stock_movements` (motivo, quantidade, saldo, pedido e usuário).

### Cadastro provisório (até o painel ficar pronto)

O painel administrativo ainda não foi construído. Para ver a loja com produtos reais antes disso, cadastre pelo **Table Editor** do Supabase:
`categories` → `products` (com `category_id`) → `product_images` (URL da imagem) → `product_variants` (opcional).
O `slug` deve conter só letras minúsculas, números e hífens (ex.: `racao-premium-1kg`).

## 2. Rodar localmente

```bash
npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Publicar no Cloudflare Pages

- **Workers & Pages → Create → Pages → Connect to Git** e selecione o repositório.
- Build command: `npm run build` · Output directory: `dist`
- Em **Environment variables**, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
