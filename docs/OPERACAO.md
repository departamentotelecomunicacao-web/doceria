# Operação: produção, migrations, backup, restauração e rollback

## Ambientes

| Ambiente | Onde | Dados |
|---|---|---|
| Local | `supabase start` + `npm run dev` | Seed fictício (`supabase/seed.sql`), recriado com `supabase db reset` |
| CI | GitHub Actions, Supabase local efêmero | Seed + dados criados pelos testes, descartados ao fim |
| Produção | Projeto Supabase + GitHub Pages | Reais. Nunca recebem seed, reset ou testes |

## Regras que protegem a produção

1. **Nunca** rode `supabase db reset` apontando para produção. O workflow de deploy do backend só executa `supabase db push`, que aplica migrations novas e nunca apaga as existentes.
2. Migrations são **somente adicionais**: nunca edite uma migration já aplicada em produção. Crie outra com a correção (`supabase migration new nome_da_mudanca`).
3. Toda migration nova precisa manter os testes de banco verdes (`npm run test:db`). O teste `01_security` falha se alguma tabela ficar sem RLS.
4. Antes de migrations que alteram ou removem colunas: faça backup (abaixo) e prefira mudanças em duas etapas (adiciona a nova coluna, migra dados, remove a antiga em uma release seguinte).
5. O deploy do frontend (GitHub Pages) não mexe no banco. O deploy do backend é manual, pede confirmação e usa o environment `production` (configure revisores obrigatórios em Settings > Environments).

## Deploy do backend

Pelo GitHub Actions: **Actions > Deploy do backend (Supabase) > Run workflow**, digite `producao`. O job:

1. vincula o projeto (`SUPABASE_PROJECT_REF`);
2. mostra as migrations pendentes (`db push --dry-run`);
3. aplica as migrations (`db push`);
4. publica as Edge Functions (`delivery-quote`, `create-order`, `admin-users`).

Pela linha de comando (máquina do responsável técnico):

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push --dry-run   # confira
npx supabase db push
npx supabase functions deploy delivery-quote create-order admin-users
```

Segredos das Edge Functions (uma vez, e sempre que mudarem):

```bash
cp supabase/functions/.env.example supabase/functions/.env.production   # preencha; não versione
npx supabase secrets set --env-file supabase/functions/.env.production
npx supabase secrets list
```

## Backup

### Backups automáticos da plataforma
- Planos pagos do Supabase incluem backups diários automáticos (a retenção depende do plano) e Point-in-Time Recovery como opcional. Confira em **Database > Backups**. Recomendado para a operação real.
- No plano gratuito, não conte com backup automático recuperável: faça o backup lógico abaixo com frequência.

### Backup lógico (qualquer plano)

```bash
SUPABASE_DB_URL="postgresql://postgres.[ref]:[senha]@aws-0-[região].pooler.supabase.com:5432/postgres" \
  npm run backup
```

Gera `backups/<data>/roles.sql`, `schema.sql` e `data.sql` (pasta ignorada pelo Git). Os arquivos contêm dados pessoais: guarde criptografados (ex.: disco criptografado ou cofre de senhas com anexos), com acesso restrito aos proprietários, e apague cópias antigas conforme a política de retenção.

Rotina sugerida: backup semanal e antes de cada deploy do backend. As fotos ficam no Storage; baixe-as pelo painel do Supabase (Storage > product-images) ou com um cliente S3 se precisar de cópia externa.

## Restauração

Em um projeto Supabase **novo** (nunca por cima da produção em uso):

```bash
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file backups/<data>/roles.sql \
  --file backups/<data>/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file backups/<data>/data.sql \
  --dbname "postgresql://postgres.[novo-ref]:[senha]@...:5432/postgres"
```

Depois: publique as Edge Functions no projeto novo, configure os segredos, atualize `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis do GitHub e rode o deploy do frontend. Recrie o job do `pg_cron` se necessário (a migration `*_storage_realtime_cron.sql` mostra os comandos).

## Rollback

| Situação | Como voltar |
|---|---|
| Deploy do frontend com problema | Actions > CI e deploy da loja > execução anterior verde > **Re-run jobs** (republica a versão anterior). Ou `git revert` do commit e push na `main` |
| Edge Function com problema | Faça checkout do commit anterior e rode `supabase functions deploy <nome>` (ou reverta o commit e rode o workflow de backend) |
| Migration com problema | Não edite nem apague a migration aplicada. Escreva uma migration nova que desfaça a mudança e aplique com `db push`. Se houve perda de dados, restaure o backup em um projeto novo e copie os dados necessários |
| Configuração errada no painel | Configurações > Atividades mostra o valor anterior de cada alteração (auditoria) |

## Tarefas agendadas

| Job (pg_cron) | Frequência | Função |
|---|---|---|
| `expire-stale-orders` | a cada minuto | Expira pedidos vencidos e devolve reservas |
| `cleanup-housekeeping` | diário 04:17 UTC | Limpa `rate_limits` antigos e cotações vencidas sem pedido |

Confira no SQL Editor: `select jobname, schedule, active from cron.job;` e o histórico em `cron.job_run_details`.

## Monitoramento

- **Edge Functions > Logs** no Supabase: eventos `create-order.created`, `delivery-quote.provider` (sucesso, motivo de falha e latência da API de mapas), `*.rejected` (erros de negócio) e `*.error` (inesperados). Os logs não contêm nome, telefone ou endereço.
- **Google Cloud Console > APIs > Routes API**: uso e custo. Configure cota diária e alerta de orçamento.
- Painel da loja: Dashboard e Configurações > Atividades.

## Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Loja mostra "Loja em configuração" | Build sem `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` | Configure as variáveis do repositório e rode o deploy |
| Catálogo não carrega (erro de rede no console) | URL/chave erradas ou CSP bloqueando | Confira as variáveis; o build gera a CSP a partir de `VITE_SUPABASE_URL` |
| Checkout: "Não foi possível calcular a entrega automaticamente." sempre | `GOOGLE_MAPS_API_KEY` ausente/inválida, Routes API desativada, origem não configurada ou teto por hora atingido | Veja os logs `delivery-quote.provider`; confira Configurações > Entrega > Origem |
| Chamadas às funções falham só no navegador (CORS) | Domínio da loja fora de `ALLOWED_ORIGINS` | `supabase secrets set ALLOWED_ORIGINS=https://loja.suamarca.com.br` |
| Pedidos não expiram | `pg_cron` desativado | Database > Extensions > pg_cron; confira `cron.job` |
| Painel não avisa novos pedidos na hora | Realtime desligado para a tabela | O painel cai para atualização a cada 15 s; confira Database > Replication > `supabase_realtime` |
| Pessoa da equipe não consegue entrar | Conta desativada ou sem profile | Configurações > Equipe (proprietário) |
| Refresh em rota da loja dá 404 no GitHub Pages | Build sem o pós-processamento | O `npm run build` roda `scripts/postbuild.mjs`; não publique o `dist` gerado só com `vite build` |
