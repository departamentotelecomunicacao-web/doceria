# Integração com o Wix

O Wix é a camada institucional (marca, história, SEO). A loja no GitHub Pages é a camada transacional. O Wix não guarda cópia de produtos: o cardápio incorporado lê o mesmo banco da loja.

## Estrutura sugerida do site Wix

| Página | Conteúdo |
|---|---|
| Início | Hero com foto real, chamada "Fazer pedido" (link para a loja), destaques, como funciona, depoimentos |
| Nossa história | História da marca e dos dois produtores, fotos da produção |
| Cardápio (`/cardapio`) | Cardápio incorporado (ver abaixo) + botão "Ver cardápio completo" |
| Entrega e retirada | Bairros atendidos, faixas de frete (as mesmas configuradas no painel), horários |
| Perguntas frequentes | Encomendas, alergênicos, validade, pagamento, eventos |
| Contato | WhatsApp, Instagram, e-mail |
| Políticas | Link para `https://loja.../privacidade` (política única, mantida pela loja) |

Links de compra no Wix devem apontar para a loja com UTM, por exemplo:
`https://loja.suamarca.com.br/produtos?utm_source=wix&utm_medium=botao&utm_campaign=home`.

## Incorporar o cardápio

A rota `https://loja.suamarca.com.br/embed` foi feita para iframe: sem cabeçalho nem rodapé, fundo transparente, categorias, produtos, preços e status. O botão "Comprar" abre a loja completa em nova aba com o item já no carrinho. Carrinho e checkout nunca rodam dentro do iframe.

Parâmetros opcionais:

| Parâmetro | Exemplo | Efeito |
|---|---|---|
| `categoria` | `?categoria=especiais` | Abre filtrado em uma categoria |
| `limite` | `?limite=6` | Mostra no máximo N produtos |
| `fundo` | `?fundo=creme` | Fundo creme em vez de transparente |

### Opção 1: Incorporar um site (mais simples)

1. No editor do Wix: **Adicionar > Incorporar código > Incorporar um site**.
2. Endereço: `https://loja.suamarca.com.br/embed?limite=8`.
3. Ajuste a altura do elemento para caber 2 linhas de produtos (a página tem rolagem interna se precisar).

### Opção 2: Elemento personalizado (altura automática)

Disponível em sites Wix com domínio e plano premium.

1. **Adicionar > Incorporar código > Elemento personalizado**.
2. **Escolher origem > URL do servidor**: `https://loja.suamarca.com.br/embed.js`
3. **Nome da tag**: `doceria-cardapio`
4. Em **Definir atributos**, opcionalmente `categoria`, `limite`, `fundo`.

O script cria o iframe e ajusta a altura conforme o conteúdo (mensagem `RESIZE`).

### Opção 3: Código HTML em qualquer site

```html
<div id="doceria-cardapio" data-limite="8"></div>
<script src="https://loja.suamarca.com.br/embed.js" data-target="#doceria-cardapio" async></script>
```

## Eventos (postMessage)

O `/embed` envia ao site pai mensagens sem dados pessoais, no formato `{ source: "doceria-embed", type, payload }`:

| Tipo | Quando |
|---|---|
| `READY` | Cardápio carregado |
| `RESIZE` | Altura mudou (`height` em px) |
| `PRODUCT_VIEW` | Cliente abriu um produto |
| `ADD_TO_CART` | Cliente clicou em Comprar (`productId`, `slug`, `name`) |
| `OPEN_STORE` | A loja completa foi aberta (`path`) |

`BEGIN_CHECKOUT` existe no contrato, mas não é emitido pelo iframe: o checkout acontece na loja. Com o `embed.js`, os eventos viram `CustomEvent` no elemento hospedeiro (`doceria:add_to_cart`, etc.). Para restringir o destino das mensagens, configure `VITE_EMBED_PARENT_ORIGINS` (ex.: `https://www.suamarca.com.br`).

## SEO

- O Wix é a camada principal de SEO: configure título, descrição, Open Graph e os dados da empresa.
- A loja define título, descrição, canonical e JSON-LD de `Product` nas páginas de produto, e marca carrinho, checkout, pedido, `/embed` e `/admin` como `noindex` (veja `public/robots.txt`).
- Não dependa do iframe para indexação: os produtos são descobertos pelos links da loja.

Dados estruturados sugeridos para a home do Wix (Configurações de SEO > Dados estruturados), sem endereço residencial:

```json
{
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Nome da Marca",
  "url": "https://www.suamarca.com.br",
  "image": "https://www.suamarca.com.br/og.jpg",
  "servesCuisine": "Cookies artesanais",
  "areaServed": { "@type": "City", "name": "Cachoeiro de Itapemirim" },
  "address": { "@type": "PostalAddress", "addressLocality": "Cachoeiro de Itapemirim", "addressRegion": "ES", "addressCountry": "BR" },
  "sameAs": ["https://instagram.com/suamarca"],
  "potentialAction": { "@type": "OrderAction", "target": "https://loja.suamarca.com.br/produtos" }
}
```

## Checklist

- [ ] `VITE_SITE_URL` do build aponta para o domínio da loja (os links "Comprar" usam esse valor).
- [ ] Página `/cardapio` do Wix carrega o `/embed` e o botão "Comprar" abre a loja com o item no carrinho.
- [ ] Links institucionais do Wix para a Política de Privacidade apontam para a loja.
- [ ] No painel, **Configurações > Loja > Site institucional** tem a URL do Wix (aparece no cabeçalho e no rodapé da loja).
