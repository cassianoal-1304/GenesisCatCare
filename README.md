# Loja virtual com painel administrativo e pedidos pelo WhatsApp

Loja virtual completa em **React + Vite + TypeScript**, com **Supabase** (banco de dados, login e imagens) e hospedagem gratuita no **Cloudflare Pages**. Não precisa de servidor próprio: as regras de negócio (preços, estoque, pedidos) ficam no banco, protegidas por políticas de segurança (RLS).

📘 **[Guia de publicação](docs/PUBLICACAO.md)** — contas, Supabase, Cloudflare, domínio e atualizações
📗 **[Manual do administrador](docs/MANUAL-ADMIN.md)** — uso do painel no dia a dia

## Funcionalidades

**Loja (clientes, sem cadastro)**
- Página inicial com banner, categorias, destaques, ofertas e novidades
- Catálogo com busca (ignora acentos), filtros por categoria, promoção e destaque, ordenação e carregamento progressivo
- Página do produto com galeria, preço promocional, variações (tamanho, cor...), indicações, benefícios e características
- Carrinho salvo no navegador, conferido com o banco (preços e estoque atuais) antes de finalizar
- Checkout (nome, telefone opcional, cidade, bairro, endereço, observações) com revisão do pedido
- Pedido registrado no banco e WhatsApp aberto com a mensagem pronta; opções de reabrir e copiar se o navegador bloquear

**Painel (`/admin`, só administradores)**
- Login, logout, recuperação de senha e rotas protegidas
- Painel com totais (disponíveis, esgotados, estoque baixo, promoções), pedidos e movimentações recentes
- Produtos: cadastro, edição, duplicação, exclusão, fotos (otimizadas automaticamente), variações com preço e estoque próprios
- Categorias com ordem e imagem
- Estoque: adicionar, retirar, registrar venda, ajustar, estoque mínimo por produto/variação, histórico completo
- Pedidos: busca, filtros, detalhes, status (Aguardando confirmação → Confirmado → Em preparação → Finalizado / Cancelado), baixa automática de estoque na confirmação e estorno
- Importação/exportação de produtos por CSV com prévia e validação
- Configurações: nome, logotipo, cores, WhatsApp, contatos, banner e textos

## Começo rápido

1. Siga o **[Guia de publicação](docs/PUBLICACAO.md)** (Supabase → Cloudflare).
2. Entre em `/admin`, preencha **Configurações** (principalmente o **WhatsApp**).
3. Crie as categorias e cadastre os produtos (manualmente ou por CSV).

Rodar no computador:
```bash
npm install
cp .env.example .env   # VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (chave pública)
npm run dev
```

## Estrutura

```
supabase/
  instalacao_completa.sql   banco completo para projeto novo (gerado: npm run sql:bundle)
  migrations/               001…008 em ordem; 005 cria o administrador
src/
  pages/store/              Home, Catálogo, Produto, Carrinho, Checkout, Pedido registrado
  pages/admin/              Login, Painel, Pedidos, Produtos, Estoque, Categorias, CSV, Configurações
  components/               ui/ (base), store/ (loja), layout/ (cabeçalho, rodapé, carrinho), admin/ (painel)
  context/                  StoreContext (configurações), CartContext (carrinho), AuthContext (sessão)
  lib/                      supabase, api da loja, checkout, whatsapp, format
  lib/admin/                operações do painel, pedidos, estoque, imagens, CSV, validações
public/                     _redirects (rotas), _headers (segurança/cache), robots.txt
docs/                       guia de publicação e manual do administrador
```

## Segurança

- **Chaves:** o site usa apenas a chave **pública** do Supabase. A chave `service_role`/secret não é usada em lugar nenhum. O `.env` não vai para o repositório.
- **RLS em todas as tabelas:** visitantes só leem produtos, categorias e configurações publicados. Não leem pedidos, clientes nem histórico de estoque, e não gravam em nenhuma tabela.
- **Pedidos:** visitantes só criam pedidos pela função `create_order`, que recalcula preços e confere a disponibilidade no banco. Do navegador são aceitos apenas os IDs dos produtos e as quantidades.
- **Administração:** todas as operações administrativas exigem login **e** cadastro na tabela `admins`, verificado no banco (não só na interface).
- **Estoque:** só muda por funções que travam as linhas, nunca deixam o estoque negativo e registram cada movimentação. A confirmação é idempotente e o estorno é único.
- **Imagens:** só administradores enviam ou excluem. São aceitos JPG, PNG, WebP e AVIF de até 5 MB, sem SVG. A listagem do bucket é restrita.
- **Validação:** feita no navegador e repetida no banco (tamanhos, formatos, preços, links `http(s)`).
- **Cabeçalhos HTTP:** CSP, `X-Frame-Options`, `nosniff`, HSTS. O painel não é indexado por buscadores.
- **Cadastro público** de usuários deve ser **desativado** no Supabase (ver guia).

## Testes realizados

Executados com Playwright contra um Postgres 16 com o mesmo esquema e as mesmas políticas, por meio de um servidor de teste que reproduz a API do Supabase (REST, Auth e Storage):
- **Etapa 2:** painel (login, produtos, imagens, variações, categorias, CSV, configurações)
- **Etapa 3:** carrinho, checkout, WhatsApp, pedidos, baixa, cancelamento, estorno, estoque, concorrência
- **Etapa 4:** os 14 cenários de ponta a ponta em banco vazio, com o cliente em celular emulado (Pixel 7)
- Chamadas diretas à API como visitante e como usuário não administrador, todas bloqueadas
- Página publicada com a CSP ativa, sem violações

Os testes não foram executados contra um projeto Supabase real (dependem das suas credenciais). Faça o pedido de teste descrito no guia após publicar.
