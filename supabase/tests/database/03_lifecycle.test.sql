begin;
\ir _setup.psql
select plan(42);

-- Pedidos base (criados como service_role, como faz a Edge Function)
set local role service_role;
create temporary table t_orders (label text primary key, result jsonb);
reset role;
grant all on t_orders to service_role, authenticated, anon;
set local role service_role;

insert into t_orders values
  ('cash', public.create_order(tests.order_payload('life-key-000000000001',
     jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 3)), 3600, 'CASH'), null)),
  ('pix', public.create_order(tests.order_payload('life-key-000000000002',
     jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000004', 2)), 3000, 'PIX'), null)),
  ('card', public.create_order(tests.order_payload('life-key-000000000003',
     jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000006', 2)), 3600, 'CARD'), null)),
  ('expire', public.create_order(tests.order_payload('life-key-000000000004',
     jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000006', 2)), 3600, 'PIX', 'PICKUP', null, '+5527988776655'), null)),
  ('active', public.create_order(tests.order_payload('life-key-000000000005',
     jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000002', 2)), 2600, 'CASH'), null));

reset role;

create or replace function tests.order_id(p_label text) returns uuid language sql as $$
  select (result ->> 'orderId')::uuid from t_orders where label = p_label
$$;
create or replace function tests.order_status(p_label text) returns text language sql as $$
  select status::text from public.orders where id = tests.order_id(p_label)
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Página pública do pedido
-- ---------------------------------------------------------------------------
set local role anon;
select is(
  public.get_public_order((select result ->> 'publicToken' from t_orders where label = 'cash')) ->> 'code',
  (select result ->> 'code' from t_orders where label = 'cash'),
  'pedido acessível pelo token público'
);
select ok(
  public.get_public_order((select result ->> 'publicToken' from t_orders where label = 'cash'))::text !~ '999887766',
  'página pública não expõe o telefone do cliente'
);
select is(
  public.get_public_order((select result ->> 'publicToken' from t_orders where label = 'pix')) #>> '{pix,key}',
  'pix@doceria.local',
  'pedido PIX mostra a chave PIX para pagamento'
);
select is(
  public.get_public_order((select result ->> 'publicToken' from t_orders where label = 'cash')) -> 'pix',
  'null'::jsonb,
  'pedido em dinheiro não mostra chave PIX'
);
select is(
  (select public.get_public_order(overlay(tok placing case when left(tok, 1) = '0' then '1' else '0' end from 1 for 1))
     from (select result ->> 'publicToken' as tok from t_orders where label = 'cash') t),
  null,
  'token manipulado não abre outro pedido'
);
reset role;

-- ---------------------------------------------------------------------------
-- Transições (operador)
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000003');

select throws_ok(
  format($$select public.admin_transition_order(%L, 'COMPLETED')$$, tests.order_id('cash')),
  'PT409', 'INVALID_TRANSITION', 'NEW não pode pular para COMPLETED'
);
select throws_ok(
  format($$select public.admin_transition_order(%L, 'EXPIRED')$$, tests.order_id('cash')),
  'PT409', 'INVALID_TRANSITION', 'equipe não marca EXPIRED manualmente'
);
select throws_ok(
  format($$select public.admin_transition_order(%L, 'CANCELED')$$, tests.order_id('cash')),
  'PT400', 'CANCEL_REASON_REQUIRED', 'cancelamento exige motivo'
);

select lives_ok(
  format($$select public.admin_transition_order(%L, 'CONFIRMED')$$, tests.order_id('cash')),
  'NEW → CONFIRMED'
);
select results_eq(
  $$select * from tests.stock_delta('22222222-2222-4222-8222-000000000001')$$,
  $$values (-3, 0)$$,
  'confirmação converte a reserva em consumo (reservado volta a zero, disponível segue -3)'
);
select is(
  (select count(*)::int from public.inventory_movements
    where order_id = tests.order_id('cash') and type = 'OUT' and source = 'ORDER'),
  1,
  'movimento OUT de consumo registrado'
);
select is(
  (select status::text from public.inventory_reservations where order_id = tests.order_id('cash')),
  'CONSUMED',
  'reserva marcada como consumida'
);
select throws_ok(
  format($$select public.admin_transition_order(%L, 'CONFIRMED')$$, tests.order_id('cash')),
  'PT409', 'INVALID_TRANSITION', 'confirmar duas vezes (duplo clique) é rejeitado'
);
select lives_ok(
  format($$select public.admin_transition_order(%L, 'PREPARING')$$, tests.order_id('cash')),
  'CONFIRMED → PREPARING'
);
select lives_ok(
  format($$select public.admin_transition_order(%L, 'READY')$$, tests.order_id('cash')),
  'PREPARING → READY'
);
select throws_ok(
  format($$select public.admin_transition_order(%L, 'OUT_FOR_DELIVERY')$$, tests.order_id('cash')),
  'PT409', 'INVALID_TRANSITION', 'pedido de retirada não sai para entrega'
);
select lives_ok(
  format($$select public.admin_transition_order(%L, 'COMPLETED')$$, tests.order_id('cash')),
  'READY → COMPLETED (retirada)'
);
select is(
  (select array_agg(to_status::text order by id) from public.order_status_history where order_id = tests.order_id('cash')),
  array['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'],
  'histórico registra cada mudança de status'
);
select throws_ok(
  format($$select public.admin_transition_order(%L, 'CANCELED', 'desistiu')$$, tests.order_id('cash')),
  'PT409', 'INVALID_TRANSITION', 'pedido concluído não pode ser cancelado'
);

-- Cancelamento de pedido NEW devolve a reserva
select lives_ok(
  format($$select public.admin_transition_order(%L, 'CANCELED', 'Cliente desistiu')$$, tests.order_id('card')),
  'NEW → CANCELED com motivo'
);

-- ---------------------------------------------------------------------------
-- Pagamento (separado do status do pedido)
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$select public.admin_set_payment_status(%L, 'REFUNDED')$$, tests.order_id('pix')),
  'PT409', 'INVALID_PAYMENT_TRANSITION', 'pagamento pendente não pode ir para reembolsado'
);
select is(
  (public.admin_set_payment_status(tests.order_id('pix'), 'PAID', 'Comprovante conferido', true) ->> 'status'),
  'CONFIRMED',
  'confirmar pagamento PIX também confirma o pedido'
);
select is(
  (select payment_status::text from public.orders where id = tests.order_id('pix')),
  'PAID',
  'pagamento marcado como pago pela equipe'
);
select is(
  (select count(*)::int from public.payment_records where order_id = tests.order_id('pix')),
  2,
  'livro de pagamentos guarda PENDING e PAID'
);

-- Cancelar pedido já confirmado devolve ao estoque (restock)
select lives_ok(
  format($$select public.admin_transition_order(%L, 'CANCELED', 'Problema na produção', true)$$, tests.order_id('pix')),
  'CONFIRMED → CANCELED com devolução ao estoque'
);
reset role;

select results_eq(
  $$select * from tests.stock_delta('22222222-2222-4222-8222-000000000004')$$,
  $$values (0, 0)$$,
  'estoque do pedido cancelado retornou ao disponível'
);

-- ---------------------------------------------------------------------------
-- Expiração automática
-- ---------------------------------------------------------------------------
select results_eq(
  $$select * from tests.stock_delta('22222222-2222-4222-8222-000000000006')$$,
  $$values (-2, 2)$$,
  'pistache: pedido cancelado devolveu 2 e o pendente segura 2'
);

update public.orders set expires_at = now() - interval '1 minute' where id = tests.order_id('expire');
select ok(public.expire_stale_orders() >= 1, 'job de expiração processa pedidos vencidos');
select is(tests.order_status('expire'), 'EXPIRED', 'pedido vencido vira EXPIRED');
select results_eq(
  $$select * from tests.stock_delta('22222222-2222-4222-8222-000000000006')$$,
  $$values (0, 0)$$,
  'reserva expirada volta ao disponível'
);
select is(
  (select status::text from public.inventory_reservations where order_id = tests.order_id('expire')),
  'EXPIRED',
  'reserva marcada como expirada'
);
select is(
  (select source from public.order_status_history where order_id = tests.order_id('expire') and to_status = 'EXPIRED'),
  'SYSTEM',
  'expiração registrada como ação do sistema'
);

-- ---------------------------------------------------------------------------
-- Estoque manual
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000003');

select throws_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000007', 'OUT', 1, 'Quebra')$$,
  'PT409', 'INSUFFICIENT_STOCK', 'saída maior que o disponível é rejeitada (nunca negativo)'
);
select throws_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000001', 'IN', 5, '')$$,
  'PT400', 'REASON_REQUIRED', 'movimentação exige motivo'
);
select throws_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000001', 'IN', -5, 'Fornada')$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade negativa é rejeitada'
);
select throws_ok(
  $$select public.inventory_adjust('22222222-2222-4222-8222-000000000001', 'RESERVATION', 5, 'Fornada')$$,
  'PT400', 'INVALID_MOVEMENT_TYPE', 'equipe não cria reserva manual'
);
select is(
  (public.inventory_adjust('22222222-2222-4222-8222-000000000007', 'ADJUSTMENT', 7, 'Contagem física') ->> 'stockAvailable')::int,
  7,
  'ajuste define o novo total disponível'
);
select is(
  (select available_delta from public.inventory_movements
    where product_id = '22222222-2222-4222-8222-000000000007' order by id desc limit 1),
  7,
  'ajuste registra a variação no movimento'
);
reset role;

-- ---------------------------------------------------------------------------
-- Dashboard e clientes
-- ---------------------------------------------------------------------------
set local role authenticated;
select tests.authenticate_as('33333333-3333-4333-8333-000000000001');

select ok(
  (public.admin_dashboard('today') ->> 'salesCents')::int >= 3600,
  'dashboard soma vendas confirmadas do dia'
);
select throws_ok(
  $$select public.admin_dashboard('custom', '2026-01-10', '2026-01-01')$$,
  'PT400', 'INVALID_PERIOD', 'período personalizado inválido é rejeitado'
);
select throws_ok(
  format($$select public.anonymize_customer(%L)$$,
    (select customer_id from public.orders where id = tests.order_id('pix'))),
  'PT409', 'CUSTOMER_HAS_ACTIVE_ORDERS', 'não anonimiza cliente com pedido em andamento'
);

-- Encerra o pedido pendente e anonimiza
select tests.authenticate_as('33333333-3333-4333-8333-000000000001');
select lives_ok(
  format($$select public.anonymize_customer(%L)$$,
    (select customer_id from public.orders where id = tests.order_id('expire'))),
  'OWNER anonimiza cliente sem pedidos ativos'
);
reset role;

select * from finish();
rollback;
