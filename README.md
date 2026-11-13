# Loja Virtual com checkout pelo WhatsApp

Loja virtual em **React + Vite + TypeScript**, com **Supabase** (banco, autenticação e imagens) e hospedagem no **Cloudflare Pages**.
Não precisa de servidor próprio: as regras de negócio ficam no banco (funções SQL + RLS).

## Status das etapas

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Banco de dados, RLS, loja pública (home, catálogo, produto, carrinho) | ✅ concluída |
| 2 | Painel administrativo: login, dashboard, produtos, imagens, variações, categorias, CSV, configurações | ✅ concluída |
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
  006_admin.sql         estoque mínimo/baixo, disponibilidade, dashboard, duplicação, importação CSV
src/
  lib/          supabase.ts (cliente), api.ts (consultas), format.ts
  types/        db.ts (tipos das tabelas)
  context/      StoreContext (configurações/categorias), CartContext (carrinho)
  hooks/        useDocumentTitle
  components/
    ui/         Icons, Feedback (carregando/vazio/erro), QuantityInput
    store/      ProductCard, ProductImage, Price, ProductSection
    layout/     Header, Footer, CartDrawer, StoreLayout
    admin/      AdminLayout, RequireAdmin, Form, Modal, Toast, ImageManager, VariantEditor
  pages/store/  HomePage, CatalogPage, ProductPage, NotFoundPage
  pages/admin/  routes, AuthPages (login/recuperação), Dashboard, Products, ProductForm,
                Categories, ImportExport, Settings
  lib/admin/    adminApi (operações do painel), images (otimização/upload), csv, productCsv, text, errors
public/_redirects  rotas SPA no Cloudflare Pages
```

## 1. Configurar o Supabase

1. Crie um projeto gratuito em <https://supabase.com>.
2. Abra **SQL Editor → New query** e execute, **nesta ordem**, o conteúdo de:
   `001_schema.sql`, `002_functions.sql`, `003_rls.sql`, `004_storage.sql`, `006_admin.sql`.
   (Se você já executou 001–004 na Etapa 1, execute apenas o `006_admin.sql`.)
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

### Autenticação (importante)

Em **Authentication → Sign In / Providers**, **desative “Allow new users to sign up”**.
Mesmo que alguém crie uma conta, ela não acessa o painel: só usuários cadastrados na tabela `admins` (script 005) entram.

Para a **recuperação de senha** funcionar, em **Authentication → URL Configuration**:
- **Site URL**: o endereço da loja (ex.: `https://sualoja.pages.dev`)
- **Redirect URLs**: adicione `https://sualoja.pages.dev/admin/redefinir-senha` (e `http://localhost:5173/admin/redefinir-senha` para testes locais)

O e-mail embutido do Supabase tem limite baixo de envios por hora. Para uso contínuo, configure um SMTP próprio em **Authentication → Emails**.

## Painel administrativo (`/admin`)

| Área | O que faz |
|---|---|
| **Painel** | Totais de produtos, disponíveis, esgotados, estoque baixo, promoções e rascunhos; pedidos e movimentações recentes |
| **Produtos** | Busca, filtros e paginação; cadastrar, editar, duplicar (cópia em rascunho com estoque zerado) e excluir |
| **Imagens** | Várias por produto (até 12), escolha da principal, reordenação, substituição e exclusão. Otimizadas no navegador (WebP, até 1600px) antes do envio |
| **Variações** | Tamanho, cor, modelo, voltagem ou tipos personalizados, com gerador de combinações. Cada variação pode ter preço próprio e tem estoque individual |
| **Categorias** | Criar, editar, ordenar, imagem opcional. Só é possível excluir categorias sem produtos |
| **Importar/Exportar** | CSV com prévia, validação por linha, atualização por ID e bloqueio de duplicados |
| **Configurações** | Nome, logotipo, cores, WhatsApp, contatos, banner, textos institucionais e opções gerais |

**Estoque:** ao editar o estoque de um produto ou variação já existente, o painel envia a **diferença** (ex.: −8), não o valor absoluto. Assim, uma venda confirmada enquanto o formulário estava aberto não é sobrescrita. Toda alteração fica registrada no histórico com o usuário responsável.

**Estoque baixo:** defina o “estoque mínimo” do produto (0 = sem alerta). Em produtos com variações, o alerta aparece quando qualquer variação ativa atinge o mínimo.

**Disponível para venda × Publicado:** um *rascunho* não aparece na loja. Um produto *indisponível* aparece, mas não pode ser comprado (também é bloqueado no banco).

### CSV

- Use **Exportar CSV** ou **Baixar modelo** para obter o formato. Separador `;` (padrão do Excel em português) ou `,`.
- Linha **com `id`** atualiza o produto. Só as colunas presentes no arquivo são alteradas.
- Linha **sem `id`** cria o produto. Se já existir outro com o mesmo slug ou SKU, a linha é recusada (evita duplicação).
- `categoria`: nome ou slug de uma categoria existente. `imagens`: URLs separadas por ` | ` (só adiciona; nunca remove).
- A importação é atômica: se algo falhar no servidor, nada é alterado. Linhas com erro aparecem na prévia e são ignoradas.
- Variações e envio de fotos são gerenciados na tela do produto.

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
