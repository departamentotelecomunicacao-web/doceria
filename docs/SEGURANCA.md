# Segurança e LGPD

O objetivo é segurança suficiente sem complicar a operação: a equipe só faz login; todas as regras ficam no banco.

## Ameaças e defesas

| Ameaça | Defesa | Onde é testado |
|---|---|---|
| Alterar preço, frete ou total no navegador | O checkout envia só IDs, quantidades e dados; campos extras são recusados; o banco recalcula tudo e compara com o total exibido (`PRICE_CHANGED`) | `validation.test.ts`, `security.test.ts`, `02_orders.test.sql` |
| Quantidade negativa, zero, fracionada ou absurda | Validação na função e no banco (1 a 99 por item) | idem |
| Vender mais que o estoque / duas compras da última unidade | Produtos travados em ordem estável dentro da transação; `CHECK (stock >= 0)` | `orders.test.ts` (concorrência) |
| Pedido duplicado (duplo clique, reenvio) | Chave de idempotência + trava; mesma chave devolve o mesmo pedido | `orders.test.ts`, `checkout.spec.ts` |
| Ver pedidos de outras pessoas | Sem leitura para visitantes; página pública só pelo link de 192 bits; mostra primeiro nome e bairro, nunca telefone ou rua | `security.test.ts`, `03_lifecycle.test.sql` |
| Painel sem login | Rotas levam ao login; dados protegidos por RLS | `admin.spec.ts`, `01_security.test.sql` |
| Atendente alterando preço ou configurações | RLS: só o dono escreve em produtos e configurações; atendente usa funções específicas | `security.test.ts`, `01_security.test.sql` |
| Cadastro de contas por estranhos | Cadastro público do Auth desligado; contas criadas pelo dono | `security.test.ts` |
| Usar o site para disparar e-mails | E-mail sai só do servidor, com conteúdo montado a partir do pedido gravado; `notify-order` exige login da equipe | `notify.test.ts` |
| Abuso da criação de pedidos | Limite por hash de IP | `http.test.ts` |
| Clickjacking no painel | Painel não abre dentro de iframe | `embed.spec.ts` |
| Vazamento de segredos | Navegador só recebe a chave publicável; chaves do EmailJS e do Supabase ficam nos segredos das funções | revisão manual |
| XSS | React escapa conteúdo; e-mails escapam HTML; CSP no build | `emails.test.ts` |

## RLS por tabela

| Tabela | Visitante | Atendente | Dono |
|---|---|---|---|
| `categories`, `products` | lê itens ativos | lê tudo; disponibilidade e quantidade via função | tudo |
| `orders`, `order_items`, `order_events`, `order_notifications` | nada (página pública via função) | lê; altera só por funções | igual ao atendente |
| `store_settings` | nada (recorte público via função) | lê | lê e altera |
| `profiles` | nada | vê a equipe | idem; gestão pela função `admin-users` |
| `rate_limits` | nada | nada | nada |
| Storage `product-images` | lê pela URL | lista | envia e remove fotos |

Funções: nada é executável por padrão; cada uma é liberada explicitamente. Tabelas novas nascem sem acesso para `anon` e `authenticated`.

## Segredos

| Segredo | Onde fica |
|---|---|
| Chave publicável do Supabase | `VITE_SUPABASE_PUBLISHABLE_KEY` (pública por natureza, protegida por RLS) |
| Chave secreta do Supabase | Só no ambiente das Edge Functions (injetada pelo Supabase) |
| Chaves do EmailJS | Supabase > Edge Functions > Secrets |
| `RATE_LIMIT_SALT` | idem |
| Token de acesso e senha do banco (deploy) | Secrets do environment `production` no GitHub |

## LGPD

- **Minimização:** nome, WhatsApp, e-mail opcional e endereço só para entrega. Sem cadastro de cliente, CPF ou senha.
- **Transparência:** página `/privacidade` com finalidades, compartilhamentos (Supabase, EmailJS, WhatsApp) e canal de contato (WhatsApp da loja).
- **Sem rastreamento:** não há analytics nem cookies de publicidade; o navegador guarda só o carrinho e o rascunho do checkout.
- **Logs:** as funções registram código do pedido, valores e status, nunca nome, telefone ou endereço.
- **Pedidos de exclusão:** atender pelo WhatsApp; os pedidos ficam guardados pelo prazo fiscal.

## Checklist antes de publicar

- [ ] `npm run test:db` verde.
- [ ] Nenhum segredo no repositório (`git grep -n "sb_secret_\|service_role\|accessToken"` sem valores reais).
- [ ] `ALLOWED_ORIGINS` só com a origem da loja.
- [ ] Auth: provedor Email **ligado** com "Allow new users to sign up" **desligado**, senha mínima de 10 caracteres, URLs com o endereço da loja.
- [ ] EmailJS: "Use Private Key" marcado.
- [ ] Environment `production` do GitHub com revisor obrigatório.
