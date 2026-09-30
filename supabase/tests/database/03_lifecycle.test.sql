begin;
\ir _setup.psql
select plan(21);

-- Pedido de entrega com Nutella (estoque 12) e Clássico (sem controle).
set local role service_role;
create temp table t_order on commit drop as
select public.create_order(tests.order_payload('pgtap-life-delivery-1',
  jsonb_build_array(
    tests.item('22222222-2222-4222-8222-000000000003', 3),
    tests.item('22222222-2222-4222-8222-000000000001', 1)),
  6200, 'PIX', 'DELIVERY', tests.address())) as r;
reset role;
grant select on t_order to authenticated, anon;

create or replace function tests.oid() returns uuid language sql stable as
$$ select (r ->> 'orderId')::uuid from t_order $$;
create or replace function tests.token() returns text language sql stable as
$$ select r ->> 'publicToken' from t_order $$;
grant execute on function tests.oid(), tests.token() to authenticated, anon;

select is(tests.stock('22222222-2222-4222-8222-000000000003'), 9, 'estoque baixou 3 unidades');

-- ---------------------------------------------------------------------------
-- Página pública
-- ---------------------------------------------------------------------------
set local role anon;
select is(public.get_public_order(tests.token()) ->> 'status', 'RECEIVED', 'página pública mostra o status');
select is(public.get_public_order(tests.token()) ->> 'customerFirstName', 'Cliente', 'mostra só o primeiro nome');
select ok(
  public.get_public_order(tests.token())::text !~ 'Rua Teste'
  and public.get_public_order(tests.token())::text !~ '99887766',
  'não mostra rua nem telefone');
select is(public.get_public_order(tests.token()) #>> '{pix,key}', 'pix@doceria.local', 'PIX pendente mostra a chave');
select is((public.get_public_order(tests.token()) ->> 'totalCents')::int, 6200, 'total 3 x 15 + 12 + 5');

-- ---------------------------------------------------------------------------
-- Atendente opera o pedido
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');

select throws_ok(
  $$select public.admin_set_status(tests.oid(), 'DELIVERED')$$,
  'PT409', 'INVALID_TRANSITION', 'não pula de Recebido para Entregue');
select is(public.admin_set_status(tests.oid(), 'CONFIRMED') ->> 'status', 'CONFIRMED', 'confirma o pedido');
select throws_ok(
  $$select public.admin_set_status(tests.oid(), 'READY_FOR_PICKUP')$$,
  'PT409', 'INVALID_TRANSITION', 'entrega não vai para "pronto para retirada"');
select is(public.admin_set_status(tests.oid(), 'PREPARING') ->> 'status', 'PREPARING', 'em preparo');

select is((public.admin_set_delivery_fee(tests.oid(), 800) ->> 'totalCents')::int, 6500, 'ajuste de frete recalcula o total');
select throws_ok(
  $$select public.admin_set_delivery_fee(tests.oid(), -1)$$,
  'PT400', 'INVALID_DELIVERY_FEE', 'frete negativo é recusado');

select lives_ok($$select public.admin_set_paid(tests.oid(), true)$$, 'marca como pago');
select lives_ok($$select public.admin_set_internal_notes(tests.oid(), 'Portão azul')$$, 'anotação interna');

reset role;
select is((select is_paid from public.orders where id = tests.oid()), true, 'pagamento gravado');
set local role anon;
select is(public.get_public_order(tests.token()) -> 'pix', 'null'::jsonb, 'pago: não mostra mais a chave PIX');

reset role;
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000002');
select is(public.admin_set_status(tests.oid(), 'CANCELED', 'Cliente desistiu') ->> 'status', 'CANCELED', 'cancela');
select is(tests.stock('22222222-2222-4222-8222-000000000003'), 12, 'cancelamento devolve o estoque');
select throws_ok(
  $$select public.admin_set_status(tests.oid(), 'CONFIRMED')$$,
  'PT409', 'INVALID_TRANSITION', 'cancelado não volta');
select throws_ok(
  $$select public.admin_set_delivery_fee(tests.oid(), 100)$$,
  'PT409', 'ORDER_CLOSED', 'pedido cancelado não muda frete');

reset role;
select is(
  (select array_agg(kind order by id)::text from public.order_events where order_id = tests.oid()),
  '{CREATED,STATUS,STATUS,FEE,PAYMENT,STATUS}', 'linha do tempo completa');

select * from finish();
rollback;
