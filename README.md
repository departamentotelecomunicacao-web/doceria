# Doceria: loja online de cookies artesanais

Sistema comercial completo para uma marca artesanal de cookies em Cachoeiro de Itapemirim (ES), operada por duas pessoas: site institucional no Wix, cardápio incorporável, loja online com carrinho e checkout, pedidos, estoque com reservas, frete pela rota real, painel administrativo e integração com WhatsApp.

```
Wix (institucional, SEO)  ──iframe /embed──▶  GitHub Pages (loja + painel, estático)
                                                     │
                                                     ▼
                     Supabase: PostgreSQL + RLS · Auth · Storage · Edge Functions · Realtime · pg_cron
```

Detalhes técnicos: [ARCHITECTURE.md](ARCHITECTURE.md) · Wix: [docs/WIX.md](docs/WIX.md) · Operação, backup e rollback: [docs/OPERACAO.md](docs/OPERACAO.md) · Segurança e LGPD: [docs/SEGURANCA.md](docs/SEGURANCA.md)

## Sumário

1. [O que o sistema faz](#o-que-o-sistema-faz)
2. [Estrutura do repositório](#estrutura-do-repositório)
3. [Rodar localmente](#rodar-localmente)
4. [Variáveis de ambiente](#variáveis-de-ambiente)
5. [Supabase: migrations, seed e testes de banco](#supabase-migrations-seed-e-testes-de-banco)
6. [Testes](#testes)
7. [Colocar em produção](#colocar-em-produção)
8. [GitHub Pages e GitHub Actions](#github-pages-e-github-actions)
9. [Domínios](#domínios)
10. [Google Routes (frete)](#google-routes-frete)
11. [Painel administrativo](#painel-administrativo)
12. [Backup](#backup)
13. [Solução de problemas](#solução-de-problemas)

## O que o sistema faz

**Loja** (`/`, `/produtos`, `/produto/:slug`, `/carrinho`, `/checkout`, `/pedido/:token`)
- Cardápio por categoria (Todos, Clássicos, Especiais, Combos, Novidades), preços e estoque em tempo real. Produto esgotado aparece, mas não pode ser comprado.
- Carrinho guarda só IDs e quantidades; preço e disponibilidade vêm sempre do banco.
- Checkout em uma página: dados, retirada ou entrega, endereço com preenchimento pelo CEP, frete calculado pela rota real, janela de horário (horário de Brasília), pagamento (PIX, dinheiro, cartão na entrega/retirada).
- Página do pedido por link secreto (sem login), com status, chave PIX quando aplicável e botão **Enviar pelo WhatsApp** com a mensagem pronta.

**Cardápio para o Wix** (`/embed` e `embed.js`): compacto, fundo transparente, altura automática. "Comprar" abre a loja com o item no carrinho.

**Painel** (`/admin`): contas individuais (OWNER, ADMIN, OPERATOR), dashboard (hoje, 7 dias, 30 dias, personalizado), central de pedidos com filtros e timeline, confirmação de pagamento, cancelamento com motivo e devolução de estoque, frete manual, registro de pedidos do WhatsApp, produtos com fotos (compressão WebP), categorias, estoque (entrada, saída, ajuste com motivo), clientes (com anonimização LGPD), configurações (loja, textos, horários, entrega, pagamentos, equipe) e registro de atividades. Funciona no celular.

**Backend:** criação de pedido atômica e idempotente, reservas de estoque com expiração automática, transições de status validadas, auditoria, RLS em todas as tabelas.

## Estrutura do repositório

```
├── src/                         Frontend (React + Vite + TypeScript + Tailwind)
│   ├── pages/store/             Loja pública
│   ├── pages/embed/             Cardápio incorporável (Wix)
│   ├── pages/admin/             Painel
│   ├── components/              UI, loja e painel
│   ├── api/                     Acesso a dados (REST público e painel)
│   ├── lib/                     Dinheiro, datas (America/Sao_Paulo), WhatsApp, analytics, SEO, embed
│   └── store/                   Carrinho
├── public/                      favicon, robots.txt, embed.js
├── supabase/
│   ├── migrations/              Schema, regras de negócio, RLS, storage, pg_cron
│   ├── seed.sql                 Dados fictícios para desenvolvimento
│   ├── tests/database/          Testes pgTAP (RLS, pedidos, estoque, transições)
│   ├── functions/               Edge Functions (delivery-quote, create-order, admin-users)
│   │   └── _shared/             Validação, rotas (Google), pagamentos, HTTP, rate limit
│   └── config.toml
├── tests/
│   ├── integration/             Testes contra o stack local (concorrência, segurança, frete)
│   ├── e2e/                     Playwright (loja, checkout, painel, celular, iframe)
│   └── stubs/                   Stub da Google Routes API e servidor que imita o GitHub Pages
├── scripts/                     postbuild (rotas do Pages), env local, backup, criação de proprietário
└── .github/workflows/           CI + deploy do Pages; deploy manual do Supabase
```

## Rodar localmente

Requisitos: Node 20+ e Docker.

```bash
npm install
npx supabase start                  # Postgres, Auth, Storage, Realtime, Edge Runtime
npm run env:local                   # gera .env.local e supabase/functions/.env a partir do supabase status
npx supabase functions serve --env-file supabase/functions/.env   # em outro terminal
npm run dev                         # http://localhost:5173
```

- Loja: http://localhost:5173 · Painel: http://localhost:5173/admin
- Contas locais do seed (senha `doceria-local-123`): `owner@doceria.local`, `admin@doceria.local`, `operador@doceria.local`.
- Sem chave do Google, o checkout mostra o fallback de WhatsApp para entrega. Para simular a API de rotas: `npm run env:test` (aponta para o stub) e `npm run stub:routes` em outro terminal. Bairros do stub: Centro 2,1 km; Gilberto Machado 4,2 km; Independência 6,8 km; Aeroporto 9,5 km; Itaoca 15 km (fora da área).

## Variáveis de ambiente

### Frontend (públicas, entram no bundle)

| Variável | Obrigatória | Exemplo |
|---|---|---|
| `VITE_SUPABASE_URL` | sim | `https://abcd1234.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | sim | `sb_publishable_...` |
| `VITE_SITE_URL` | sim | `https://loja.suamarca.com.br` |
| `VITE_BASE_PATH` | não | `/` (domínio próprio) ou `/doceria/` (usuario.github.io/doceria) |
| `VITE_GTM_ID`, `VITE_GA4_ID`, `VITE_META_PIXEL_ID` | não | carregados só após consentimento |
| `VITE_EMBED_PARENT_ORIGINS` | não | `https://www.suamarca.com.br` |

Nunca coloque chave secreta, service role, chave do Google ou de pagamento em variáveis `VITE_`.

### Edge Functions (secretas)

Veja `supabase/functions/.env.example`. Em produção: `npx supabase secrets set --env-file <arquivo>`.

| Variável | Descrição |
|---|---|
| `ALLOWED_ORIGINS` | Domínios autorizados (CORS), ex.: `https://loja.suamarca.com.br` |
| `GOOGLE_MAPS_API_KEY` | Chave com a Routes API habilitada |
| `ROUTING_PROVIDER` | `google` |
| `ROUTE_CACHE_TTL_HOURS` | Cache de distância por endereço (padrão 168) |
| `ROUTING_MAX_CALLS_PER_HOUR` | Teto global de chamadas pagas (padrão 300) |
| `RATE_LIMIT_SALT` | Valor aleatório longo (hash do IP) |
| `QUOTE_RATE_LIMIT_PER_10_MIN`, `ORDER_RATE_LIMIT_PER_10_MIN` | Limites por IP (padrão 30 e 12) |

`SUPABASE_URL` e as chaves do projeto são injetadas automaticamente pelo Supabase nas funções.

## Supabase: migrations, seed e testes de banco

```bash
npx supabase db reset        # LOCAL: recria o banco, aplica migrations e o seed
npm run test:db              # testes pgTAP (107 asserções)
npx supabase migration new nome_da_mudanca   # nova migration (nunca edite as já aplicadas em produção)
```

- `supabase/seed.sql` é **somente local** (produtos, faixas de frete, contas de teste). Em produção o catálogo é cadastrado pelo painel.
- A linha de configurações da loja (`store_settings`) é criada pela migration com valores neutros; ajuste tudo em **Configurações**.

## Testes

| Comando | O que cobre |
|---|---|
| `npm run lint` · `npm run typecheck` | ESLint e TypeScript (app, testes e Edge Functions) |
| `npm test` | Unitários (Vitest): validação, frete/rotas, carrinho, dinheiro, datas, WhatsApp, analytics, componentes |
| `npm run test:db` | pgTAP: RLS, preço no servidor, idempotência, estoque, transições, expiração, LGPD |
| `npm run test:integration` | Stack local: concorrência, duplo envio, preço alterado, API de mapas indisponível, papéis |
| `npm run test:e2e` | Playwright em desktop e celular (fusos diferentes de São Paulo): compra completa, painel, sessão expirada, iframe do Wix, rotas do Pages |

Integração e E2E precisam do stack local com o stub de rotas: `npx supabase start`, `npm run env:test`, `npm run stub:routes` e `npx supabase functions serve --env-file supabase/functions/.env`.

## Colocar em produção

1. **Supabase**
   1. Crie o projeto (região São Paulo, `sa-east-1`).
   2. Authentication > Sign In / Providers: desative novos cadastros (signups). Defina senha mínima de 10 caracteres com letras e números. Em URL Configuration, use o domínio da loja.
   3. Database > Extensions: confirme `pg_cron` disponível (a migration o habilita).
   4. Aplique as migrations e publique as funções (workflow **Deploy do backend** ou `supabase db push` + `supabase functions deploy`, veja [docs/OPERACAO.md](docs/OPERACAO.md)).
   5. Configure os segredos das funções (`supabase secrets set ...`).
   6. Crie a conta de cada proprietário (uma por pessoa):
      ```bash
      SUPABASE_URL=https://SEU-PROJETO.supabase.co SUPABASE_SECRET_KEY=sb_secret_... \
        npm run owner:create -- "Nome Completo" email@dominio.com
      ```
      A chave secreta fica só na sua máquina durante o comando. Demais pessoas: **Configurações > Equipe**.
2. **Google Cloud:** ative a Routes API, crie uma chave restrita a ela, defina cota diária e alerta de orçamento.
3. **Painel da loja:** preencha Configurações (dados, WhatsApp, horários, origem da entrega, faixas de frete, PIX), cadastre categorias, produtos, fotos e estoque inicial.
4. **GitHub:** configure as variáveis e o Pages (abaixo) e faça merge na `main`.
5. **Wix:** incorpore o cardápio e aponte os botões para a loja ([docs/WIX.md](docs/WIX.md)).

## GitHub Pages e GitHub Actions

Workflow `CI e deploy da loja` (`.github/workflows/ci.yml`):

```
push/PR ─▶ quality: lint · typecheck · unitários · build
        └▶ e2e: supabase start · pgTAP · integração · Playwright
main    ─▶ deploy (só se os dois passarem): build de produção ─▶ GitHub Pages
```

Configuração única no repositório:

1. **Settings > Pages > Build and deployment > Source: GitHub Actions.**
2. **Settings > Secrets and variables > Actions > Variables:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, e opcionalmente `VITE_BASE_PATH`, `CUSTOM_DOMAIN`, `VITE_GTM_ID`, `VITE_GA4_ID`, `VITE_META_PIXEL_ID`, `VITE_EMBED_PARENT_ORIGINS`.
3. Para o workflow `Deploy do backend (Supabase)`: crie o environment `production` (com revisores obrigatórios), a variável `SUPABASE_PROJECT_REF` e os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`.

O Pages é estático: o `scripts/postbuild.mjs` cria `index.html` para cada rota conhecida (abrir ou atualizar `/checkout` responde 200) e um `404.html` que é o próprio app para rotas dinâmicas (`/produto/:slug`, `/pedido/:token`).

## Domínios

| Domínio | Serviço |
|---|---|
| `www.suamarca.com.br` | Wix (institucional) |
| `loja.suamarca.com.br` | GitHub Pages (loja, `/embed` e `/admin`) |

1. No DNS: `CNAME loja → <usuario>.github.io`.
2. Variável `CUSTOM_DOMAIN=loja.suamarca.com.br` (o build grava o arquivo `CNAME`) e `VITE_SITE_URL=https://loja.suamarca.com.br`.
3. Settings > Pages: informe o domínio e marque **Enforce HTTPS**.
4. Atualize `ALLOWED_ORIGINS` das funções e as URLs do Auth no Supabase.

Um subdomínio separado para o painel (`admin.suamarca.com.br`) é opcional: o painel já é protegido pelo backend e carregado sob demanda. Para separar, publique o mesmo build em um segundo repositório/Pages com outro `CUSTOM_DOMAIN`.

## Google Routes (frete)

- O frete usa a **distância da rota** (sem trânsito em tempo real); a duração é só estimativa exibida.
- A chave existe apenas nas Edge Functions. A cotação só é pedida com endereço completo, com debounce, e o resultado fica em cache por endereço normalizado.
- Regras no painel (**Configurações > Entrega**): tabela por faixas (ex.: 0 a 3 km R$ 5; 3 a 5 km R$ 7; 5 a 8 km R$ 10; 8 a 12 km R$ 14) ou taxa base + preço por km; frete grátis acima de um valor; distância máxima.
- Se a API falhar, não há distância inventada: o cliente vê "Não foi possível calcular a entrega automaticamente." e pode seguir pelo WhatsApp ou escolher retirada. A equipe pode registrar o pedido com frete manual.

## Painel administrativo

| Papel | Acesso |
|---|---|
| Proprietário (OWNER) | Tudo, incluindo equipe e anonimização de clientes |
| Administrador (ADMIN) | Produtos, clientes, configurações, auditoria, pedidos e estoque |
| Operador (OPERATOR) | Pedidos e estoque |

Rotina típica pelo celular: **Pedidos** (novo pedido chega em tempo real) → abrir → **Confirmar pedido** ou **Confirmar pagamento e pedido** (PIX) → **Iniciar preparo** → **Marcar como pronto** → **Saiu para entrega** / **Concluir**. Estoque: **Entrada** a cada fornada, com motivo.

## Backup

`npm run backup` com `SUPABASE_DB_URL` gera papéis, schema e dados em `backups/` (fora do Git). Restauração, rollback e cuidados com dados pessoais em [docs/OPERACAO.md](docs/OPERACAO.md).

## Solução de problemas

A tabela completa está em [docs/OPERACAO.md](docs/OPERACAO.md#solução-de-problemas). Os casos mais comuns:

- **"Loja em configuração"**: faltam `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` no build.
- **Entrega sempre cai no WhatsApp**: chave do Google ausente ou sem a Routes API, origem não configurada no painel, ou teto de chamadas por hora atingido. Veja os logs da função `delivery-quote`.
- **Erro de CORS ao finalizar pedido**: o domínio da loja não está em `ALLOWED_ORIGINS`.
- **Pedidos não expiram**: `pg_cron` desativado.
- **Local: imagens Docker não baixam**: rode `npx supabase start` novamente; em redes restritas, configure um espelho de registro no Docker.
