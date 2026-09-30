begin;
\ir _setup.psql
select plan(27);

set local role service_role;

-- ---------------------------------------------------------------------------
-- Cálculo no servidor
-- ---------------------------------------------------------------------------
select is(
  (public.create_order(tests.order_payload('pgtap-order-pickup-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400)) ->> 'totalCents')::int,
  2400, 'retirada: 2 x R$ 12,00, sem frete');

select is(
  (public.create_order(tests.order_payload('pgtap-order-deliv-0001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000003', 2)), 3500,
    'PIX', 'DELIVERY', tests.address())) ->> 'deliveryFeeCents')::int,
  500, 'entrega: frete fixo da configuração (R$ 5,00)');

select is(tests.stock('22222222-2222-4222-8222-000000000003'), 10, 'estoque controlado baixa com o pedido (12 -> 10)');
select is(tests.stock('22222222-2222-4222-8222-000000000001'), null, 'produto sem controle continua sem controle');

select is(
  (select count(*)::int from public.order_events e join public.orders o on o.id = e.order_id
    where o.idempotency_key = 'pgtap-order-deliv-0001' and e.kind = 'CREATED'),
  1, 'linha do tempo registra a criação');

select is(
  (public.create_order(tests.order_payload('pgtap-order-fakeprice1',
    jsonb_build_array(jsonb_build_object('productId', '22222222-2222-4222-8222-000000000001', 'quantity', 1, 'priceCents', 1)),
    1200)) ->> 'totalCents')::int,
  1200, 'preço enviado junto com o item é ignorado');

select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-price-0001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 100))$$,
  'PT409', 'PRICE_CHANGED', 'total diferente do calculado é recusado');

select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-noaddr-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1700, 'CASH', 'DELIVERY'))$$,
  'PT400', 'INVALID_ADDRESS', 'entrega sem endereço é recusada');

-- ---------------------------------------------------------------------------
-- Estoque e disponibilidade
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-nostock-01',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000005', 1)), 1800))$$,
  'PT409', 'OUT_OF_STOCK', 'produto com estoque 0 não é vendido');

select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-toomany-01',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000004', 9)), 13500))$$,
  'PT409', 'OUT_OF_STOCK', 'quantidade acima do estoque é recusada');

reset role;
update public.products set is_active = false where id = '22222222-2222-4222-8222-000000000002';
set local role service_role;
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-inactive1',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000002', 1)), 1300))$$,
  'PT409', 'PRODUCT_UNAVAILABLE', 'produto indisponível é recusado');

select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-qty0-0001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 0)), 0))$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade zero é recusada');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-qty100-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 100)), 120000))$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade acima de 99 é recusada');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-qtyfrac-01',
    jsonb_build_array(jsonb_build_object('productId', '22222222-2222-4222-8222-000000000001', 'quantity', 1.5)), 1800))$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade fracionada é recusada');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-empty-001', '[]'::jsonb, 0))$$,
  'PT400', 'EMPTY_CART', 'carrinho vazio é recusado');

-- ---------------------------------------------------------------------------
-- Idempotência
-- ---------------------------------------------------------------------------
select is(
  (public.create_order(tests.order_payload('pgtap-order-pickup-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400)) ->> 'replayed')::boolean,
  true, 'mesma chave e mesmos dados devolvem o mesmo pedido');
select is(
  (select count(*)::int from public.orders where idempotency_key = 'pgtap-order-pickup-001'),
  1, 'reenvio não duplica o pedido');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-pickup-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 3)), 3600))$$,
  'PT409', 'IDEMPOTENCY_CONFLICT', 'mesma chave com outros dados é recusada');

-- ---------------------------------------------------------------------------
-- Cliente, pagamento e agenda
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.create_order(jsonb_set(tests.order_payload('pgtap-order-phone-001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200), '{customer,phone}', '"123"'))$$,
  'PT400', 'INVALID_CUSTOMER', 'WhatsApp inválido é recusado');
select throws_ok(
  $$select public.create_order(jsonb_set(tests.order_payload('pgtap-order-change-01',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200), '{cashChangeForCents}', '500'))$$,
  'PT400', 'INVALID_CASH_CHANGE', 'troco menor que o total é recusado');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-past-0001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200,
    'CASH', 'PICKUP', null, public.store_today() - 1))$$,
  'PT409', 'DATE_UNAVAILABLE', 'data no passado é recusada');
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-far-00001',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200,
    'CASH', 'PICKUP', null, public.store_today() + 60))$$,
  'PT409', 'DATE_UNAVAILABLE', 'data além do limite é recusada');
select throws_ok(
  $$select public.create_order(jsonb_set(tests.order_payload('pgtap-order-evening1',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200), '{fulfillment,period}', '"EVENING"'))$$,
  'PT409', 'DATE_UNAVAILABLE', 'período não oferecido é recusado');

reset role;
update public.store_settings
   set open_weekdays = array[((extract(dow from public.store_today())::int + 1) % 7)::smallint]
 where id;
set local role service_role;
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-closed-01',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200))$$,
  'PT409', 'DATE_UNAVAILABLE', 'dia sem funcionamento é recusado');

-- ---------------------------------------------------------------------------
-- Loja pausada, entrega desligada e pedido mínimo
-- ---------------------------------------------------------------------------
reset role;
update public.store_settings set open_weekdays = '{0,1,2,3,4,5,6}', accepting_orders = false where id;
set local role service_role;
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-paused-01',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200))$$,
  'PT409', 'STORE_PAUSED', 'loja pausada não recebe pedidos');

reset role;
update public.store_settings set accepting_orders = true, delivery_enabled = false where id;
set local role service_role;
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-nodeliv-1',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1700, 'CASH', 'DELIVERY', tests.address()))$$,
  'PT409', 'DELIVERY_UNAVAILABLE', 'entrega desligada é recusada');

reset role;
update public.store_settings set delivery_enabled = true, min_order_cents = 5000 where id;
set local role service_role;
select throws_ok(
  $$select public.create_order(tests.order_payload('pgtap-order-minimum-1',
    jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200))$$,
  'PT409', 'BELOW_MINIMUM_ORDER', 'pedido abaixo do mínimo é recusado');

select * from finish();
rollback;
