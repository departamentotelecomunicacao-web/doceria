# Arquitetura

Loja online de uma marca artesanal de cookies em Cachoeiro de Itapemirim (ES). Modelo simples de propósito: frete fixo, estoque opcional, dois papéis na equipe e devolutiva por e-mail e WhatsApp.

## Visão geral

```
┌───────────────┐   iframe /embed    ┌─────────────────────────────────────┐
│ Wix           │ ─────────────────▶ │ GitHub Pages (build estático)       │
│ início, sobre,│   "Comprar" abre   │ /            loja                   │
│ serviços      │   a loja em nova   │ /embed       cardápio para o Wix    │
└───────────────┘   aba              │ /admin       painel da equipe       │
                                     └──────────────┬──────────────────────┘
                                                    │ HTTPS (chave publicável)
┌───────────────────────────────────────────────────▼──────────────────────┐
│ Supabase                                                                  │
│  Postgres + RLS: produtos, pedidos, itens, histórico, e-mails, config.    │
│  Funções SQL: create_order (preço, frete, estoque), status, pago, frete   │
│  Auth: contas da equipe (Dono, Atendente) · Storage: fotos · Realtime     │
│  Edge Functions:                                                          │
│    create-order  valida, grava pelo create_order, envia e-mails ──┐       │
│    notify-order  e-mail do status atual (equipe logada) ──────────┼─▶ EmailJS
│    admin-users   gestão da equipe (só o dono)                     │       │
└───────────────────────────────────────────────────────────────────┴───────┘
```

## Princípios

1. **O banco é a fonte da verdade.** Loja, painel e cardápio do Wix leem o mesmo Supabase. Mudar preço ou taxa no painel vale na hora, sem deploy.
2. **O navegador não define valores.** O checkout envia IDs, quantidades, contato, endereço, dia, período e pagamento. Preço, frete fixo, total e estoque são calculados em `public.create_order`. Campos extras são recusados.
3. **Pedido atômico e idempotente.** `create_order` trava os produtos em ordem estável, confere disponibilidade, grava pedido e itens (com nome e preço da época) e baixa o estoque na mesma transação. A mesma chave de idempotência devolve o mesmo pedido.
4. **O e-mail nunca derruba o pedido.** Primeiro o pedido é gravado; depois os e-mails são enviados e registrados em `order_notifications` (enviado, falhou, não enviado). O painel mostra e permite reenviar.
5. **Operação simples.** A equipe só faz login e toca em botões; o que é regra fica no banco.

## Banco

| Migration | Conteúdo |
|---|---|
| `20260929*` | Primeira versão (frete por distância, reservas). Mantidas porque migrations não são editadas |
| `20260930120000_simplificacao_limpeza.sql` | Remove as estruturas da primeira versão |
| `20260930120100_schema.sql` | Tabelas, tipos e restrições |
| `20260930120200_functions.sql` | Regras: agenda, pedido, página pública, ações do painel, limite por IP |
| `20260930120300_security.sql` | RLS, permissões, fotos e tempo real |

| Tabela | Uso |
|---|---|
| `profiles` | Equipe (`OWNER` ou `STAFF`) |
| `store_settings` | Linha única: loja, taxa de entrega, retirada, dias, períodos, pagamentos, PIX, avisos |
| `categories`, `products` | Cardápio. `products.stock` nulo = sem controle de quantidade |
| `orders`, `order_items` | Pedido (contato, endereço, dia e período, valores, pago) e itens com nome e preço da época |
| `order_events` | Histórico: criação, status, pagamento, frete |
| `order_notifications` | E-mails enviados por pedido |
| `rate_limits` | Limite de pedidos por hash de IP |

## Fluxo do pedido

```
Cliente                         create-order (Edge)                 Banco
   │ itens + contato + dia ──────▶ valida formato, limite por IP ──▶ create_order
   │                              │                                  │ trava produtos
   │                              │                                  │ confere estoque e agenda
   │                              │                                  │ total = itens + taxa fixa
   │                              │                                  │ compara com o total exibido
   │                              │◀─────────────────── pedido ──────┘
   │                              │ e-mail ao cliente e à loja (EmailJS)
   │◀── link do pedido ───────────┘
   │ "Enviar pelo WhatsApp" (mensagem pronta para a loja)
```

## Status

```
RECEIVED ─▶ CONFIRMED ─▶ PREPARING ─▶ OUT_FOR_DELIVERY (entrega)  ─▶ DELIVERED
                   └──────────────────▶ READY_FOR_PICKUP (retirada) ─┘
qualquer um antes de DELIVERED ─▶ CANCELED (devolve o estoque)
```

Pagamento é independente: "pago" ou "a receber", marcado pela equipe. E-mail ao cliente em Confirmado, Saiu para entrega, Pronto para retirada e Cancelado (pode ser desligado).

## Frontend

- React 19, React Router 7, TanStack Query, Tailwind v4. A loja pública usa um cliente REST mínimo; o `supabase-js` só carrega no painel.
- Datas da agenda são chaves `AAAA-MM-DD` no calendário de São Paulo; o fuso do aparelho não interfere (testado com navegadores em Nova York e Tóquio).
- GitHub Pages: o pós-build cria `index.html` para as rotas conhecidas e `404.html` (o próprio app) para as dinâmicas. CSP gerada no build.

## Decisões

| Decisão | Motivo |
|---|---|
| Supabase em vez de JSON em arquivo (JSONBin) | Pedidos simultâneos não se sobrescrevem e nenhuma chave de escrita fica no código público |
| Frete fixo editável | Atendimento em uma cidade; o valor pode ser ajustado em cada pedido |
| E-mail pelo servidor via EmailJS | Reaproveita a conta existente e impede uso do site para spam |
| WhatsApp por link (`wa.me`) | Sem custo e sem aprovação da Meta; a mensagem já vai escrita |
| `/embed` abre a loja em nova aba | Checkout fora do iframe do Wix (sem problemas de cookies e sandbox) |
