begin;
\ir _setup.psql
select plan(31);

-- ---------------------------------------------------------------------------
-- RLS habilitado em todas as tabelas do schema public
-- ---------------------------------------------------------------------------
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

select is((select count(*)::int from public.products), 10, 'anon vê apenas produtos ativos (10 no seed)');

select throws_ok('select * from public.orders', '42501', null, 'anon não lê pedidos');
select throws_ok('select * from public.customers', '42501', null, 'anon não lê clientes');
select throws_ok('select * from public.customer_addresses', '42501', null, 'anon não lê endereços');
select throws_ok('select * from public.store_settings', '42501', null, 'anon não lê configurações privadas');
select throws_ok('select * from public.inventory_movements', '42501', null, 'anon não lê movimentos de estoque');
select throws_ok('select * from public.audit_logs', '42501', null, 'anon não lê auditoria');
select throws_ok('select * from public.delivery_quotes', '42501', null, 'anon não lê cotações');
select throws_ok(
  $$update public.products set price_cents = 1 where slug = 'cookie-classico'$$,
  '42501', null, 'anon não altera preço');
select throws_ok(
  $$insert into public.products (name, slug, price_cents) values ('Hack', 'hack', 1)$$,
  '42501', null, 'anon não cria produto');
select throws_ok(
  $$select public.create_order('{}'::jsonb, null)$$,
  '42501', null, 'anon não chama create_order diretamente (somente Edge Function)');
select throws_ok(
  $$select public.admin_transition_order('00000000-0000-0000-0000-000000000000', 'CONFIRMED')$$,
  '42501', null, 'anon não chama funções administrativas');
select throws_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000001', 'IN', 5, 'teste')$$,
  '42501', null, 'anon não ajusta estoque');
select throws_ok(
  $$select public.get_routing_origin()$$,
  '42501', null, 'anon não lê a origem privada das rotas');

select ok(
  not (public.get_public_store_config() ? 'originAddress')
  and not (public.get_public_store_config()::text like '%Jerônimo%'),
  'configuração pública não expõe o endereço de produção'
);

select is(public.get_public_order('abc'), null, 'token malformado não retorna pedido');
select is(public.get_public_order(repeat('a', 48)), null, 'token inexistente não retorna pedido');

reset role;

-- ---------------------------------------------------------------------------
-- Usuário autenticado sem profile (não é equipe)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('44444444-4444-4444-8444-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'intruso@teste.com', '', '{}', '{}', now(), now());

set local role authenticated;
select tests.authenticate_as('44444444-4444-4444-8444-000000000001');

select is((select count(*)::int from public.orders), 0, 'autenticado sem profile não vê pedidos');
select is((select count(*)::int from public.store_settings), 0, 'autenticado sem profile não vê configurações');
select throws_ok(
  $$select public.admin_dashboard('today')$$,
  'PT403', 'FORBIDDEN', 'autenticado sem profile não acessa o dashboard');
select is_empty(
  $$update public.products set price_cents = 1 returning id$$,
  'autenticado sem profile não altera produtos (RLS)');

reset role;

-- ---------------------------------------------------------------------------
-- Operador: gerencia pedidos e estoque, mas não produtos/configurações
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000003');

select is_empty(
  $$update public.products set price_cents = 1 where slug = 'cookie-classico' returning id$$,
  'operador não altera preço');
select is_empty(
  $$update public.store_settings set store_name = 'X' returning id$$,
  'operador não altera configurações');
select throws_ok(
  $$select public.admin_list_customers()$$,
  'PT403', 'FORBIDDEN', 'operador não lista clientes');
select lives_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000001', 'IN', 2, 'Fornada extra')$$,
  'operador registra entrada de estoque');

reset role;

-- ---------------------------------------------------------------------------
-- Admin: altera produto, mas estoque só por movimentação
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');

select isnt_empty(
  $$update public.products set price_cents = 1300 where slug = 'cookie-classico' returning id$$,
  'admin altera preço');
select throws_ok(
  $$update public.products set stock_available = 999 where slug = 'cookie-classico'$$,
  'PT400', 'STOCK_DIRECT_UPDATE_FORBIDDEN', 'estoque não pode ser alterado diretamente');
select throws_ok(
  $$select public.anonymize_customer(gen_random_uuid())$$,
  'PT403', 'FORBIDDEN', 'somente OWNER anonimiza clientes');

reset role;

select is(
  (select count(*)::int from public.audit_logs where action = 'products.price_changed'),
  1,
  'alteração de preço gera auditoria'
);

select is(
  (select available_delta from tests.stock_delta('22222222-2222-4222-8222-000000000001')),
  2,
  'entrada do operador somou 2 unidades ao estoque'
);

select * from finish();
rollback;
