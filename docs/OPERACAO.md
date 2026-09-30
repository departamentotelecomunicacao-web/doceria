# Operação: produção, backup, restauração e rollback

## Ambientes

| Ambiente | Onde | Dados |
|---|---|---|
| Local | `supabase start` + `npm run dev` | Seed fictício (`supabase/seed.sql`), recriado com `supabase db reset` |
| CI | GitHub Actions, Supabase local descartável | Seed + dados dos testes |
| Produção | Projeto Supabase + GitHub Pages | Reais. Nunca recebem seed, reset ou testes |

## Regras que protegem a produção

1. **Nunca** rode `supabase db reset` apontando para produção. O deploy do backend só executa `supabase db push`, que aplica migrations novas.
2. Migrations são **somente adicionais**: nunca edite uma migration já aplicada. Crie outra (`supabase migration new nome`).
3. Toda migration nova precisa manter `npm run test:db` verde (o teste falha se alguma tabela ficar sem RLS).
4. O deploy do frontend (Pages) não mexe no banco. O do backend é manual, pede a palavra `producao` e aprovação no environment `production`.

## Primeira publicação (passo a passo)

1. **GitHub** (Settings): Pages com fonte "GitHub Actions"; variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, `VITE_BASE_PATH`, `SUPABASE_PROJECT_REF`; environment `production` com revisor obrigatório e os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`.
2. **Merge do PR na `main`**: o CI roda os testes e publica a loja no Pages.
3. **Actions > Deploy do backend (Supabase) > Run workflow** (branch `main`, confirmação `producao`, aprovar o environment). Ele:
   1. vincula o projeto;
   2. mostra as migrations pendentes (`db push --dry-run`);
   3. aplica as migrations (`db push`);
   4. publica as Edge Functions `create-order`, `notify-order` e `admin-users`.
4. **Supabase > Authentication**:
   - URL Configuration: Site URL = endereço da loja; Redirect URLs = `<endereço da loja>/**`;
   - Providers > Email **ligado** (é o login da equipe) e "Allow new users to sign up" **desligado**; senha mínima de 10 caracteres.
5. **Supabase > Edge Functions > Secrets**: `SITE_URL`, `ALLOWED_ORIGINS`, `RATE_LIMIT_SALT` e as quatro do EmailJS ([EMAILJS.md](EMAILJS.md)).
6. **Conta do dono**: Authentication > Users > Add user (marque "Auto Confirm User") e, no SQL Editor:
   ```sql
   insert into public.profiles (id, full_name, email, role, is_active)
   select id, 'Nome Completo', email, 'OWNER', true from auth.users where email = 'email@dominio.com';
   ```
   Alternativa pela linha de comando: `npm run owner:create` (veja o cabeçalho de `scripts/create-owner.mjs`). As demais contas o dono cria em Configurações > Equipe.
7. **Painel > Configurações**: WhatsApp, e-mail que recebe os pedidos, taxa de entrega, endereço de retirada, dias e períodos, chave PIX. Depois, **Produtos**.

Pela linha de comando (alternativa ao workflow):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy create-order notify-order admin-users
npx supabase secrets set --env-file supabase/functions/.env.production   # arquivo fora do Git
```

## Backup

- **Plano grátis do Supabase:** não conte com backup automático recuperável. Faça o backup lógico abaixo com frequência (sugestão: semanal e antes de cada deploy do backend).
- **Planos pagos:** backups diários em Database > Backups.

```bash
SUPABASE_DB_URL="postgresql://postgres.[ref]:[senha]@aws-0-[região].pooler.supabase.com:5432/postgres" npm run backup
```

Gera `backups/<data>/roles.sql`, `schema.sql` e `data.sql` (fora do Git). Contêm dados pessoais: guarde criptografados e com acesso restrito. As fotos ficam no Storage (bucket `product-images`).

**Projeto grátis parado:** o Supabase pausa projetos grátis após cerca de 7 dias sem uso. Com pedidos entrando isso não acontece; depois de férias, reative em Project > Restore.

## Restauração

Em um projeto Supabase **novo** (nunca por cima da produção em uso):

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file backups/<data>/roles.sql --file backups/<data>/schema.sql \
  --command 'SET session_replication_role = replica' --file backups/<data>/data.sql \
  --dbname "postgresql://postgres.[novo-ref]:[senha]@...:5432/postgres"
```

Depois: publique as Edge Functions, configure os segredos, atualize as variáveis `VITE_*` e `SUPABASE_PROJECT_REF` no GitHub e rode o deploy.

## Rollback

| Situação | Como voltar |
|---|---|
| Loja com problema | `git revert` do commit e push na `main` (ou re-executar um deploy anterior verde) |
| Edge Function com problema | Reverter o commit e rodar o workflow de backend (ou `supabase functions deploy <nome>` do commit anterior) |
| Migration com problema | Não edite a migration aplicada: escreva outra que desfaça a mudança e aplique com `db push` |

## Monitoramento

- **Painel da loja**: Pedidos (resumo do dia) e o histórico de e-mails de cada pedido.
- **Supabase > Edge Functions > Logs**: `create-order.created`, `notify.email` (enviado, falhou), `*.rejected` (erros de regra) e `*.error` (inesperados). Os logs não trazem nome, telefone nem endereço.
- **EmailJS > History**: envios e cota do mês (200 no plano grátis).

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| "Loja em configuração" | Build sem as variáveis `VITE_SUPABASE_*` | Configure as variáveis e rode o deploy |
| Erro de conexão só ao finalizar | Origem da loja fora de `ALLOWED_ORIGINS` | Ajuste o segredo (só a origem, ex.: `https://usuario.github.io`) |
| E-mail não chega | Segredos do EmailJS ausentes, envio pelo servidor não liberado ou cota esgotada | Histórico do pedido no painel, logs `notify.email`, EmailJS > History |
| Painel não avisa pedidos na hora | Tempo real desligado | O painel cai para atualização a cada 15 s; confira Database > Replication > `supabase_realtime` |
| Pessoa da equipe não entra | Conta desativada, sem profile ou provedor Email desligado | Configurações > Equipe; Authentication > Providers |
| Atualizar a página dá 404 no Pages | Build sem o pós-processamento | Use `npm run build` (roda `scripts/postbuild.mjs`) |
