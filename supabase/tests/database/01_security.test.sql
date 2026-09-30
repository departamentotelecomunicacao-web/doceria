begin;
\ir _setup.psql
select plan(30);

select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'todas as tabelas públicas têm RLS habilitado'
);

-- ---------------------------------------------------------------------------
-- Visitante anônimo
-- ---------------------------------------------------------------------------
set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select is((select count(*)::int from public.products), 6, 'anon vê só produtos ativos (6 no seed)');
select throws_ok('select * from public.orders', '42501', null, 'anon não lê pedidos');
select throws_ok('select * from public.order_items', '42501', null, 'anon não lê itens de pedido');
select throws_ok('select * from public.order_notifications', '42501', null, 'anon não lê devolutivas');
select throws_ok('select * from public.store_settings', '42501', null, 'anon não lê configurações privadas');
select throws_ok('select * from public.profiles', '42501', null, 'anon não lê a equipe');
select throws_ok(
  $$update public.products set price_cents = 1 where slug = 'cookie-classico'$$,
  '42501', null, 'anon não altera preço');
select throws_ok(
  $$select public.create_order('{}'::jsonb)$$,
  '42501', null, 'anon não chama create_order direto (só a Edge Function)');
select throws_ok(
  $$select public.admin_set_status('00000000-0000-0000-0000-000000000000', 'CONFIRMED')$$,
  '42501', null, 'anon não chama funções do painel');
select ok(public.get_public_store_config() ->> 'storeName' is not null, 'anon lê a configuração pública');
select ok(
  not (public.get_public_store_config() ? 'pixKey') and not (public.get_public_store_config() ? 'notifyEmail'),
  'configuração pública não expõe PIX nem e-mail interno');
select is(public.get_public_order('abc'), null, 'token malformado devolve null');
select is(public.get_public_order(repeat('a', 48)), null, 'token inexistente devolve null');

-- ---------------------------------------------------------------------------
-- Autenticado sem profile (ex.: conta criada fora do painel)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select tests.authenticate_as('44444444-4444-4444-8444-000000000009');
select is((select count(*)::int from public.orders), 0, 'sem profile: não vê pedidos');
select throws_ok(
  $$select public.admin_set_paid('00000000-0000-0000-0000-000000000000', true)$$,
  'PT403', null, 'sem profile: não opera pedidos');

-- ---------------------------------------------------------------------------
-- Atendente (STAFF)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');
select is((select count(*)::int from public.store_settings), 1, 'atendente lê configurações');
select lives_ok(
  $$update public.store_settings set delivery_fee_cents = 1 where id$$,
  'update de configurações pelo atendente não gera erro...');
reset role;
select is((select delivery_fee_cents from public.store_settings), 500, '...mas não altera nada (RLS)');
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');
update public.products set price_cents = 1 where slug = 'cookie-classico';
reset role;
select is((select price_cents from public.products where slug = 'cookie-classico'), 1200, 'atendente não altera preço');
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');
select lives_ok(
  $$select public.admin_set_product_stock('22222222-2222-4222-8222-000000000004', false, 3)$$,
  'atendente marca produto como esgotado/ajusta quantidade');
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('product-images', 'x.webp')$$,
  '42501', null, 'atendente não envia fotos');

-- ---------------------------------------------------------------------------
-- Dono (OWNER)
-- ---------------------------------------------------------------------------
select tests.authenticate_as('33333333-3333-4333-8333-000000000001');
update public.store_settings set delivery_fee_cents = 700 where id;
update public.products set price_cents = 1300 where slug = 'cookie-classico';
reset role;
select is((select delivery_fee_cents from public.store_settings), 700, 'dono altera a taxa de entrega');
select is((select price_cents from public.products where slug = 'cookie-classico'), 1300, 'dono altera preço');
select is(
  (select is_active from public.products where id = '22222222-2222-4222-8222-000000000004'),
  false, 'disponibilidade alterada pelo atendente foi gravada');

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.rate_limit_hit(text, integer, integer)', 'execute'),
  'anon não executa rate_limit_hit');
select ok(
  not has_function_privilege('authenticated', 'public.create_order(jsonb)', 'execute'),
  'equipe também não chama create_order direto');
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'update'),
  'ninguém altera pedidos direto na tabela');
select ok(
  not has_table_privilege('authenticated', 'public.rate_limits', 'select'),
  'rate_limits fechado para a equipe');
select ok(
  (select count(*) from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace
    where n.nspname = 'public' and a.defaclobjtype = 'r'
      and a.defaclrole = 'postgres'::regrole  -- papel das migrations e do SQL Editor
      and array_to_string(a.defaclacl, ',') ~ '(^|,)anon=') = 0,
  'tabelas novas nascem sem acesso para anon');

select * from finish();
rollback;
