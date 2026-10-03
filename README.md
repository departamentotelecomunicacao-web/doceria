# Doceria: loja online de cookies artesanais

Loja online e painel de pedidos de uma marca artesanal de cookies em Cachoeiro de Itapemirim (ES), operada por duas pessoas. O cliente escolhe os cookies, finaliza sem cadastro e recebe a confirmação por e-mail e WhatsApp. A equipe recebe o pedido no painel, confirma e avisa o cliente em um toque.

```
Wix (páginas institucionais) ──iframe /embed──▶ GitHub Pages (loja + painel, estático)
                                                        │
                                                        ▼
                   Supabase: banco com RLS · login da equipe · fotos · Edge Functions ──▶ EmailJS
```

O Supabase é o ponto de encontro entre a loja e o painel: o pedido feito no site fica guardado lá e aparece no painel na hora. Nada de preço, frete ou estoque é decidido pelo navegador.

Mais detalhes: [ARCHITECTURE.md](ARCHITECTURE.md) · Wix: [docs/WIX.md](docs/WIX.md) · E-mails: [docs/EMAILJS.md](docs/EMAILJS.md) · Operação e backup: [docs/OPERACAO.md](docs/OPERACAO.md) · Segurança e LGPD: [docs/SEGURANCA.md](docs/SEGURANCA.md)

## O que o sistema faz

**Loja** (`/`, `/produtos`, `/produto/:slug`, `/carrinho`, `/checkout`, `/pedido/:token`)
- Vitrine com destaques, cardápio por categoria e página de cada produto. Esgotado aparece, mas não pode ser comprado.
- Checkout em uma página: nome, WhatsApp, e-mail (opcional), **entrega com taxa fixa** (padrão R$ 5,00, em Cachoeiro de Itapemirim) ou **retirada grátis**, dia e período (manhã, tarde, noite), pagamento (PIX, dinheiro com troco, cartão na entrega/retirada).
- Página do pedido por link secreto: andamento, chave PIX quando for o caso e botão **Enviar pelo WhatsApp** com o pedido escrito.
- E-mail automático de confirmação ao cliente e aviso de pedido novo para a loja ([docs/EMAILJS.md](docs/EMAILJS.md)).

**Cardápio para o Wix** (`/embed` e `embed.js`): o Wix mostra o mesmo cardápio da loja; "Comprar" abre a loja com o item no carrinho.

**Painel** (`/admin`), feito para o celular:
- **Pedidos:** resumo do dia, lista "Em aberto / Para hoje / Todos", aviso sonoro e atualização em tempo real. No pedido: botão do próximo passo (Confirmar, Em preparo, Saiu para entrega ou Pronto para retirada, Concluir), cancelar (devolve o estoque), marcar pago, ajustar o frete daquele pedido, anotações, histórico, e-mails enviados e **Avisar no WhatsApp** com a mensagem do status pronta.
- **Produtos:** foto, preço, descrição, categoria (botão **Categorias** ou "Gerenciar categorias" no cadastro), ordem no cardápio a partir de 1, destaque; disponível ou fora do cardápio; quantidade opcional (vazio = sem limite).
- **Configurações** (só o dono): dados da loja, foto de capa da página inicial, pausar pedidos, taxa de entrega, retirada, dias e períodos, PIX, avisos por e-mail e equipe.

| Papel | Pode |
|---|---|
| Dono(a) | Tudo |
| Atendente | Pedidos e disponibilidade/quantidade dos produtos |

## Estrutura do repositório

```
├── src/                     Frontend (React + Vite + TypeScript + Tailwind)
│   ├── pages/store/         Loja
│   ├── pages/embed/         Cardápio para o Wix
│   ├── pages/admin/         Painel
│   ├── api/ lib/ store/     Dados, utilitários (dinheiro, datas, WhatsApp) e carrinho
├── supabase/
│   ├── migrations/          Banco, regras de pedido, RLS, fotos, tempo real
│   ├── seed.sql             Dados fictícios (só local)
│   ├── tests/database/      Testes pgTAP
│   └── functions/           create-order, notify-order, admin-users (+ _shared: validação, e-mail)
├── tests/                   Integração, E2E (Playwright) e stubs (EmailJS, GitHub Pages)
├── scripts/                 Pós-build do Pages, ambiente local, backup, criação do dono
└── .github/workflows/       CI + deploy do Pages; deploy manual do Supabase
```

## Rodar localmente

Requisitos: Node 20+ e Docker.

```bash
npm install
npx supabase start
npm run env:local                  # gera .env.local e supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env    # outro terminal
npm run dev                        # http://localhost:5173
```

- Contas do seed (senha `doceria-local-123`): `dono@doceria.local` e `atendente@doceria.local`.
- Para ver os e-mails sem EmailJS: `npm run env:test` e `npm run stub:email` (as mensagens ficam em http://127.0.0.1:54401/__emails).

## Variáveis de ambiente

**Frontend** (públicas, vão para o navegador): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, `VITE_BASE_PATH` (`/doceria/` em usuario.github.io/doceria; `/` com domínio próprio) e, opcional, `VITE_EMBED_PARENT_ORIGINS`. Nunca coloque chave secreta em variáveis `VITE_`.

**Edge Functions** (secretas, em Supabase > Edge Functions > Secrets; modelo em `supabase/functions/.env.example`):

| Variável | Descrição |
|---|---|
| `SITE_URL` | Endereço da loja (links dos e-mails) |
| `ALLOWED_ORIGINS` | Origem da loja para CORS, sem caminho (ex.: `https://usuario.github.io`) |
| `EMAILJS_SERVICE_ID`, `EMAILJS_TEMPLATE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` | E-mail ([docs/EMAILJS.md](docs/EMAILJS.md)); vazios = e-mail desligado |
| `RATE_LIMIT_SALT` | Texto aleatório longo |
| `ORDER_RATE_LIMIT_PER_10_MIN` | Pedidos por IP a cada 10 min (padrão 12) |

## Testes

| Comando | Cobre |
|---|---|
| `npm run lint` · `npm run typecheck` | ESLint e TypeScript |
| `npm test` | Unitários: validação, e-mails, WhatsApp, carrinho, dinheiro, datas, componentes |
| `npm run test:db` | pgTAP: RLS, cálculo de preço e frete, estoque, idempotência, agenda, status |
| `npm run test:integration` | Stack local: concorrência pela última unidade, duplo clique, preço alterado, e-mails, papéis |
| `npm run test:e2e` | Playwright em desktop e celular: compra completa, painel, iframe do Wix, rotas do Pages |

Integração e E2E precisam de `npx supabase start`, `npm run env:test`, `npm run stub:email` e `npx supabase functions serve --env-file supabase/functions/.env`. O CI faz tudo isso sozinho.

## Colocar em produção

1. **Supabase:** criar o projeto (São Paulo), configurar os segredos das funções, rodar o workflow **Deploy do backend (Supabase)** e criar a conta do dono. Passo a passo em [docs/OPERACAO.md](docs/OPERACAO.md).
2. **EmailJS:** criar o modelo único e liberar o envio pelo servidor ([docs/EMAILJS.md](docs/EMAILJS.md)).
3. **GitHub:** Settings > Pages com fonte "GitHub Actions" e as variáveis `VITE_*`. Todo merge na `main` passa pelos testes e publica a loja.
4. **Painel:** preencher Configurações (WhatsApp, e-mail da loja, taxa de entrega, endereço de retirada, dias, PIX) e cadastrar os produtos com foto.
5. **Wix:** incorporar o cardápio ([docs/WIX.md](docs/WIX.md)).

## Solução de problemas

- **"Loja em configuração":** faltam `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` no build.
- **Erro ao finalizar pedido (CORS):** a origem da loja não está em `ALLOWED_ORIGINS`.
- **E-mail não chega:** veja o histórico de e-mails no pedido (painel) e [docs/EMAILJS.md](docs/EMAILJS.md).
- **Equipe não consegue entrar:** conta desativada ou sem profile (Configurações > Equipe). O provedor Email do Supabase precisa estar ligado.
- Mais casos em [docs/OPERACAO.md](docs/OPERACAO.md#solução-de-problemas).
