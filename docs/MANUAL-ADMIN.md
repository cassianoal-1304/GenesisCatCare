# Manual do administrador

Guia rápido para gerenciar a loja pelo painel. Funciona no computador e no celular.

---

## 1. Entrar no painel

1. Acesse `https://SEU-SITE/admin`.
2. Digite seu **e-mail** e **senha** e toque em **Entrar**.
3. Esqueceu a senha? Toque em **Esqueci minha senha**, informe o e-mail e abra o link recebido para criar uma nova (o link leva a `/admin/redefinir-senha`).
4. Para sair, use **Sair** no fim do menu lateral (no celular, toque no ☰ para abrir o menu).

Só e-mails cadastrados como administrador entram. Para adicionar outra pessoa, veja o passo 3.3 do [Guia de publicação](PUBLICACAO.md).

---

## 2. Configurar a loja e o WhatsApp

**Menu → Configurações**

| Seção | O que preencher |
|---|---|
| Identidade | Nome da loja, slogan, logotipo (PNG, JPG ou WebP) e as duas cores |
| Contato e WhatsApp | **WhatsApp para pedidos** (com DDD, ex.: `(11) 98765-4321` — o 55 é adicionado sozinho), telefone, e-mail, endereço, horário, Instagram e Facebook (endereço completo com `https://`) |
| Banner | Título, subtítulo, texto do botão e imagem de fundo da página inicial |
| Textos institucionais | “Sobre a loja”, texto do rodapé (ex.: CNPJ) e descrição para o Google |
| Configurações gerais | Mostrar “últimas unidades” e estoque mínimo padrão para novos produtos |

Toque em **Salvar configurações**. As mudanças aparecem na loja imediatamente.

> ⚠️ Sem o **WhatsApp** configurado, o cliente não consegue finalizar pedidos.

---

## 3. Criar categorias

**Menu → Categorias → Nova categoria**

1. Digite o **nome** (o endereço é gerado sozinho).
2. Opcional: descrição e imagem.
3. **Ativa** ligado = aparece na loja.
4. **Salvar**.

- **Ordem na loja:** use as setas ↑ ↓ ao lado de cada categoria.
- **Excluir:** só é possível se a categoria não tiver produtos. Mova os produtos para outra categoria antes.

---

## 4. Cadastrar produtos

**Menu → Produtos → Novo produto**

1. **Nome** (obrigatório) e, se quiser, um **resumo** curto e a **descrição**.
2. **Imagens:** veja a seção 5.
3. **Preço** (obrigatório, ex.: `49,90`) e **preço promocional** (opcional — deve ser menor que o preço).
4. **Estoque** e **estoque mínimo** (o alerta de estoque baixo aparece ao atingir o mínimo; `0` desliga o alerta).
5. **Variações** (tamanho, cor, modelo, voltagem…): veja a seção 4.1.
6. **Detalhes** (opcionais): indicações, benefícios (um por linha), características (uma por linha) e informações adicionais. Campos vazios não aparecem na loja.
7. Na coluna da direita:
   - **Publicado:** desligado = rascunho, não aparece na loja.
   - **Disponível para venda:** desligado = aparece, mas não pode ser comprado.
   - **Produto em destaque:** aparece em “Destaques” na página inicial.
   - **Categoria**, **endereço (slug)** e **SKU/código**.
8. Toque em **Cadastrar produto**.

Na lista de produtos você pode **buscar**, **filtrar**, **editar** (lápis), **duplicar** (cria uma cópia em rascunho, com estoque zerado) e **excluir** (lixeira).

### 4.1 Variações
1. Em **Variações e estoque**, toque em um tipo (`+ Tamanho`, `+ Cor`…) ou digite outro e toque em **Adicionar**.
2. Em “Gerar combinações”, digite os valores separados por vírgula (ex.: `P, M, G`) e toque em **Gerar**.
3. Para cada variação, informe o **estoque**. O **preço próprio** é opcional (vazio = usa o preço do produto).
4. Desmarque **Ativa** para esconder uma variação sem apagá-la.

Cada variação tem estoque separado: quando uma acaba, só ela fica esgotada.

---

## 5. Adicionar fotos

Na tela do produto, seção **Imagens**:

- **Enviar:** toque em *Enviar imagens* e escolha uma ou várias fotos (no celular, pode usar a câmera ou a galeria). Até 12 por produto.
- **Imagem principal:** é a primeira. Para trocar, toque na ⭐ da foto desejada.
- **Mudar a ordem:** setas ← →.
- **Substituir:** ícone 🔄.
- **Excluir:** lixeira.
- Fotos marcadas “Não salva” só são enviadas quando você toca em **Salvar**.

As fotos são reduzidas automaticamente antes do envio (formato WebP, até 1600 px), para a loja carregar rápido. Use JPG, PNG ou WebP (SVG não é aceito por segurança).

---

## 6. Atualizar preços

- **Um produto:** Produtos → lápis → altere **Preço** ou **Preço promocional** → **Salvar alterações**.
- **Tirar a promoção:** apague o preço promocional e salve.
- **Vários de uma vez:** use a importação CSV (seção 11).

O novo preço vale na hora para a loja. Pedidos já feitos mantêm o preço do momento da compra. Se um cliente estiver com o produto no carrinho, ele vê um aviso de que o preço mudou.

---

## 7. Atualizar o estoque

**Menu → Estoque**

Para cada produto (ou cada variação), toque em **Movimentar** e escolha:

| Opção | Quando usar |
|---|---|
| **Adicionar** | Chegou mercadoria |
| **Retirar** | Perda, avaria, uso interno, brinde (motivo obrigatório) |
| **Registrar venda** | Venda feita fora do site (balcão, telefone) |
| **Ajustar quantidade** | Contagem/inventário: informa o número exato (motivo obrigatório) |

- **Mínimo:** define o estoque mínimo do produto ou de cada variação (vazio na variação = usa o do produto).
- **Filtros:** “Estoque baixo”, “Esgotados”, “Disponíveis”.
- **Histórico de movimentações:** mostra data, produto, variação, tipo, quantidade, estoque antes → depois, motivo, quem fez e o pedido relacionado.

Quando o estoque chega a zero, o produto (ou a variação) aparece como **Esgotado** e a loja não aceita mais pedidos dele.

---

## 8. Registrar vendas feitas fora do site

**Estoque → Movimentar → Registrar venda**, informe a quantidade e, se quiser, um motivo (ex.: “Venda no balcão”). O estoque é descontado e a venda fica no histórico.

---

## 9. Confirmar pedidos

Quando o cliente finaliza o pedido no site, ele aparece em **Menu → Pedidos** como **Aguardando confirmação**, e o cliente envia a mensagem pelo WhatsApp.

> O estoque **não** é reservado nem descontado nessa hora.

1. Combine pagamento e entrega com o cliente pelo WhatsApp.
2. Abra o pedido em **Pedidos** (você pode buscar por número, nome, telefone ou cidade e filtrar por data e status).
3. Confira os itens. Se algum produto acabou nesse meio-tempo, aparece um aviso vermelho com o que precisa ser ajustado, e a confirmação fica bloqueada.
4. Toque em **Confirmar pedido** → **Confirmar e baixar estoque**. O estoque é descontado na hora e as movimentações ficam ligadas ao pedido.
5. Depois, avance o status: **Em preparação** → **Finalizar pedido**.

Use **Anotações internas** para registrar forma de pagamento, frete etc. O botão **Conversar no WhatsApp** abre a conversa com o cliente (se ele informou o telefone).

---

## 10. Cancelar pedidos e fazer estornos

1. Abra o pedido e toque em **Cancelar pedido**.
2. Comportamento:
   - **Pedido ainda não confirmado:** o estoque não muda.
   - **Pedido já confirmado:** a opção **“Devolver as unidades ao estoque (estorno)”** vem marcada. Desmarque apenas se os produtos não voltarão para venda (ex.: avariados).
3. Se cancelou sem estornar e mudou de ideia, abra o pedido e toque em **Estornar estoque**.

O estorno só pode ser feito **uma vez** por pedido e fica registrado no histórico como “Estorno de pedido”.

---

## 11. Importar e exportar produtos (CSV)

**Menu → Importar / Exportar**

### Exportar
**Exportar CSV** baixa todos os produtos. Abre no Excel ou no Google Planilhas.

### Importar
1. Toque em **Baixar modelo** (arquivo vazio) ou use um arquivo exportado.
2. Preencha uma linha por produto:
   - **Sem `id`** → cria um produto novo (obrigatórios: `nome` e `preco`).
   - **Com `id`** (copiado da exportação) → atualiza aquele produto.
3. Regras das células na atualização:
   - **vazia** → mantém o valor atual;
   - **`-`** (hífen) → apaga o valor (ex.: remover a promoção ou a categoria).
4. Outras regras:
   - `categoria`: nome ou endereço de uma categoria **já existente**;
   - `publicado` / `disponivel` / `destaque`: `sim` ou `não`;
   - `imagens`: links `https://` separados por ` | `. Só adiciona fotos, nunca remove;
   - `estoque`: só vale para produtos **sem** variações.
5. Toque em **Selecionar arquivo**. Aparece uma **prévia** com o que será criado, atualizado e as linhas com erro (e o motivo de cada erro). **Nada é gravado ainda.**
6. Toque em **Importar N produto(s)** e confirme. As linhas com erro são ignoradas; se algo falhar no servidor, nada é alterado.

Produtos com o mesmo endereço (slug) ou SKU de outro já existente são recusados, para evitar duplicação. Para atualizar, use o `id`.

Variações e envio de fotos do computador são feitos na tela do produto.

---

## Dúvidas rápidas

| Situação | O que fazer |
|---|---|
| Produto não aparece na loja | Verifique se está **Publicado** (rascunhos ficam ocultos) |
| Cliente diz que não consegue comprar | Verifique estoque, **Disponível para venda** e se o WhatsApp está configurado |
| “Estoque insuficiente para confirmar” | Ajuste o estoque em **Estoque** ou combine outro produto com o cliente; depois confirme |
| Errei uma quantidade de estoque | **Estoque → Movimentar → Ajustar quantidade** com o valor correto e o motivo |
| Painel diz “Acesso não autorizado” | O e-mail não está cadastrado como administrador (passo 3.3 da publicação) |
