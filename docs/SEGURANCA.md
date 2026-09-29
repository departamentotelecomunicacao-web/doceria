# Segurança e LGPD

## Modelo de ameaças e defesas

| Ameaça | Defesa | Onde é testado |
|---|---|---|
| Alterar preço, subtotal, frete ou total no navegador | O checkout só envia IDs, quantidades e dados; campos extras são rejeitados; o banco recalcula tudo e compara com o total exibido (`PRICE_CHANGED`) | `validation.test.ts`, `security.test.ts`, `02_orders.test.sql` |
| Enviar distância ou coordenadas falsas | Endereço sem `lat/lng/distanceKm` (rejeitados); rota sempre calculada/validada no servidor; cotação amarrada ao hash do endereço e da origem | `delivery.test.ts`, `02_orders.test.sql` |
| Quantidade negativa, zero, fracionada ou absurda | Validação na Edge Function e no banco (1 a 500; linhas negativas não compensam positivas) | `security.test.ts`, `02_orders.test.sql` |
| Produto inexistente ou inativo | `PRODUCT_UNAVAILABLE` | idem |
| Estoque negativo / venda acima do estoque | `CHECK (stock_available >= 0)`, função única de movimentação, `FOR UPDATE` nos produtos | `orders.test.ts` (concorrência), `03_lifecycle.test.sql` |
| Duas compras simultâneas da última unidade | Locks de linha em ordem estável; só uma reserva vence | `orders.test.ts` |
| Pedido duplicado (duplo clique, timeout, refresh, retry) | `idempotencyKey` + advisory lock + índice único; mesma chave devolve o mesmo pedido | `orders.test.ts`, `checkout.spec.ts` |
| Alterar estoque direto pela API | Trigger bloqueia `UPDATE` de colunas de estoque fora das funções de movimentação | `01_security.test.sql` |
| Ver pedidos de outras pessoas | Sem SELECT para `anon`; página pública só por `public_token` de 192 bits; endereço mascarado; telefone não aparece | `security.test.ts`, `03_lifecycle.test.sql` |
| Manipular `publicOrderToken` | Formato validado; token inexistente devolve `null` sem diferenciar | idem |
| Acessar o painel sem login | Rotas redirecionam ao login; **dados** protegidos por RLS e funções com checagem de papel | `admin.spec.ts`, `01_security.test.sql` |
| Operador fazendo ações de administrador | RLS por papel (`has_min_role`) e `require_role` nas funções | `security.test.ts`, `01_security.test.sql` |
| Sessão roubada ou expirada | Tokens do Supabase Auth com expiração e rotação de refresh; conta desativada é banida no Auth | `admin.spec.ts` |
| Clickjacking no painel | Painel não renderiza dentro de iframe | `embed.spec.ts` |
| Abuso das funções públicas | Rate limit por hash de IP; teto global de chamadas pagas à API de mapas | `delivery.test.ts` |
| Vazamento de segredos | Frontend só recebe a chave publicável; chaves do Google e service role existem apenas nas Edge Functions; `.env` fora do Git; CI sem segredos para testes | revisão manual |
| Injeção de SQL | PostgREST parametrizado; funções com `search_path = ''` e nomes qualificados | revisão manual |
| XSS | React escapa conteúdo; nenhum `dangerouslySetInnerHTML`; CSP restritiva no build | revisão manual |

## RLS: resumo por tabela

| Tabela | anon | equipe (authenticated com profile ativo) |
|---|---|---|
| `categories`, `products`, `product_images` | SELECT de itens ativos | SELECT tudo; escrita ADMIN+ (estoque só via funções) |
| `customers`, `customer_addresses` | nada | SELECT ADMIN+ |
| `orders`, `order_items`, `order_status_history`, `payment_records`, `inventory_*` | nada | SELECT equipe; escrita somente via funções |
| `store_settings` | nada (recorte público via `get_public_store_config`) | SELECT equipe; UPDATE ADMIN+ |
| `delivery_rules` | nada (resumo na configuração pública) | SELECT equipe; escrita ADMIN+ |
| `delivery_quotes`, `audit_logs` | nada | SELECT ADMIN+ |
| `profiles` | nada | cada um vê o próprio; equipe vê a equipe; escrita pela Edge Function `admin-users` |
| `rate_limits` | nada | nada (somente service role) |
| `storage.objects` (`product-images`) | leitura pública pela URL | escrita ADMIN+ |

Funções: `EXECUTE` revogado de `PUBLIC`, `anon` e `authenticated` e liberado uma a uma. Privilégios padrão do schema `public` foram fechados: uma tabela nova nasce inacessível até ganhar RLS e GRANT explícitos.

## Papéis

| Papel | Pode |
|---|---|
| OPERATOR | Ver e operar pedidos (status, pagamento, anotações), registrar pedidos, movimentar estoque, ver produtos |
| ADMIN | Tudo do operador + produtos, categorias, imagens, clientes, frete manual, configurações, auditoria |
| OWNER | Tudo do admin + equipe (criar contas, mudar papéis, desativar, redefinir senha) e anonimização de clientes |

Cada pessoa tem sua conta. O sistema impede remover o último proprietário ativo. O cadastro público do Auth fica desligado; contas são criadas pelo proprietário.

## Segredos

| Segredo | Onde fica |
|---|---|
| Chave publicável do Supabase | Variável `VITE_SUPABASE_PUBLISHABLE_KEY` (pública por natureza; protegida por RLS) |
| Chave secreta / service role | Somente no ambiente das Edge Functions (injetada pelo Supabase) |
| `GOOGLE_MAPS_API_KEY` | `supabase secrets set` (restrinja a chave à Routes API e defina cota diária no Google Cloud) |
| `RATE_LIMIT_SALT` | `supabase secrets set` |
| Token de acesso e senha do banco para deploy | Secrets do GitHub (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) no environment `production` |

## LGPD

- **Minimização:** nome, telefone, e-mail opcional e endereço só para entrega. Sem cadastro de cliente, sem senha, sem data de nascimento ou CPF.
- **Base legal:** execução do contrato de compra e obrigações legais; legítimo interesse para segurança (IP apenas como hash com sal).
- **Transparência:** página `/privacidade` com controlador, finalidades, compartilhamentos (Supabase, Google, ViaCEP, WhatsApp), retenção, direitos e canal de contato configurável.
- **Cookies:** apenas armazenamento essencial (carrinho, rascunho do checkout, preferências). GA4, GTM e Meta Pixel só carregam após consentimento explícito e só se configurados.
- **Direitos do titular:** o proprietário pode **anonimizar** um cliente no painel (Clientes). Nome, telefone, e-mail e endereços são removidos; pedidos e valores ficam para fins contábeis.
- **Logs:** as Edge Functions registram código do pedido, status, valores e cidade, nunca nome, telefone ou endereço.
- **Dados públicos:** a página do pedido mostra só o primeiro nome e o endereço com número mascarado; o endereço da produção nunca é exibido publicamente (o de retirada aparece apenas para quem fez pedido de retirada).

## Checklist de revisão antes de publicar

- [ ] `npm run test:db` verde (inclui "todas as tabelas com RLS").
- [ ] Nenhum segredo no repositório (`git grep -n "sb_secret_\|service_role\|AIza"` sem resultados).
- [ ] `ALLOWED_ORIGINS` contém apenas os domínios da loja.
- [ ] Chave do Google restrita à Routes API, com cota e alerta de orçamento.
- [ ] Auth: provedor Email **ligado** (é o login da equipe) com "Allow new users to sign up" **desligado**, senha mínima de 10 caracteres, URL do site e redirecionamentos com o domínio da loja. O teste `security.test.ts` confirma que o cadastro público é recusado.
- [ ] Environment `production` do GitHub com revisores obrigatórios.
