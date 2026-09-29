begin;
\ir _setup.psql
select plan(34);

-- Endereço de entrega e cotação válida (2,5 km)
create temporary table t_addr as
select '{"cep":"29300-000","street":"Rua Teste","number":"42","neighborhood":"Centro","city":"Cachoeiro de Itapemirim","state":"es"}'::jsonb as addr;

insert into public.delivery_quotes (id, origin_hash, destination_hash, provider, status, distance_meters, duration_seconds, expires_at)
select '55555555-5555-4555-8555-000000000001',
       public.get_routing_origin() ->> 'hash',
       public.normalize_delivery_address(addr) ->> 'destinationHash',
       'test', 'OK', 2500, 600, now() + interval '1 hour'
from t_addr;

-- Cotação expirada
insert into public.delivery_quotes (id, origin_hash, destination_hash, provider, status, distance_meters, duration_seconds, expires_at)
select '55555555-5555-4555-8555-000000000002',
       public.get_routing_origin() ->> 'hash',
       public.normalize_delivery_address(addr) ->> 'destinationHash',
       'test', 'OK', 2500, 600, now() - interval '1 minute'
from t_addr;

-- Cotação fora da área (15 km)
insert into public.delivery_quotes (id, origin_hash, destination_hash, provider, status, distance_meters, duration_seconds, expires_at)
select '55555555-5555-4555-8555-000000000003',
       public.get_routing_origin() ->> 'hash',
       public.normalize_delivery_address(addr) ->> 'destinationHash',
       'test', 'OK', 15000, 1500, now() + interval '1 hour'
from t_addr;

grant select on t_addr to service_role;
set local role service_role;

-- ---------------------------------------------------------------------------
-- Preço sempre recalculado no servidor
-- ---------------------------------------------------------------------------
select is(
  (public.create_order(
    tests.order_payload('ord-key-0000000000001',
      jsonb_build_array(
        tests.item('22222222-2222-4222-8222-000000000001', 2) || '{"priceCents": 1, "unitPriceCents": 1}',
        tests.item('22222222-2222-4222-8222-000000000004', 1)),
      3900) || '{"subtotalCents": 1, "totalCents": 1, "deliveryFeeCents": 0}'
  ) ->> 'totalCents')::int,
  3900,
  'total calculado pelo servidor ignora valores monetários enviados pelo navegador'
);

select results_eq(
  $$select product_name_snapshot, unit_price_cents_snapshot, quantity, line_total_cents
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where o.idempotency_key = 'ord-key-0000000000001' order by product_name_snapshot$$,
  $$values ('Cookie Clássico', 1200, 2, 2400), ('Recheado de Nutella', 1500, 1, 1500)$$,
  'itens guardam snapshot de nome e preço'
);

select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000002',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 1), null)$$,
  'PT409', 'PRICE_CHANGED', 'total esperado diferente do real gera PRICE_CHANGED'
);

-- ---------------------------------------------------------------------------
-- Validações de quantidade e produto
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000003',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', -2)), -2400), null)$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade negativa é rejeitada'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000004',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 0)), 0), null)$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade zero é rejeitada'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000005',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 100000)), 1), null)$$,
  'PT400', 'INVALID_QUANTITY', 'quantidade absurda é rejeitada'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000006',
      jsonb_build_array(
        tests.item('22222222-2222-4222-8222-000000000001', 5),
        tests.item('22222222-2222-4222-8222-000000000001', -4)), 1200), null)$$,
  'PT400', 'INVALID_QUANTITY', 'linhas negativas não compensam linhas positivas'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000007',
      '[{"productId":"22222222-2222-4222-8222-000000000001","quantity":1.5}]'::jsonb, 1800), null)$$,
  'PT400', 'INVALID_PAYLOAD', 'quantidade fracionada é rejeitada'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000008',
      jsonb_build_array(tests.item('99999999-9999-4999-8999-999999999999', 1)), 1000), null)$$,
  'PT409', 'PRODUCT_UNAVAILABLE', 'produto inexistente é rejeitado'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000009',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000007', 1)), 1500), null)$$,
  'PT409', 'OUT_OF_STOCK', 'produto esgotado bloqueia a compra'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000010',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000006', 5)), 9000), null)$$,
  'PT409', 'OUT_OF_STOCK', 'quantidade acima do estoque é rejeitada'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000011', '[]'::jsonb, 0), null)$$,
  'PT400', 'EMPTY_CART', 'carrinho vazio é rejeitado'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('short',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400), null)$$,
  'PT400', 'INVALID_IDEMPOTENCY_KEY', 'chave de idempotência obrigatória'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000012',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 1)), 1200), null)$$,
  'PT409', 'BELOW_MINIMUM_ORDER', 'pedido abaixo do mínimo é rejeitado'
);
select throws_ok(
  $$select public.create_order(
      jsonb_set(tests.order_payload('ord-key-0000000000013',
        jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400),
        '{customer,phone}', '"123"'), null)$$,
  'PT400', 'INVALID_CUSTOMER', 'telefone inválido é rejeitado'
);
select throws_ok(
  $$select public.create_order(
      jsonb_set(tests.order_payload('ord-key-0000000000014',
        jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400),
        '{fulfillment,scheduledFor}', '"2020-01-01T12:00:00Z"'), null)$$,
  'PT409', 'SLOT_UNAVAILABLE', 'horário fora das janelas é rejeitado'
);

-- ---------------------------------------------------------------------------
-- Idempotência
-- ---------------------------------------------------------------------------
select is(
  (public.create_order(tests.order_payload('ord-key-0000000000001',
      jsonb_build_array(
        tests.item('22222222-2222-4222-8222-000000000001', 2),
        tests.item('22222222-2222-4222-8222-000000000004', 1)),
      3900), null) ->> 'replayed')::boolean,
  true,
  'reenvio com a mesma chave devolve o mesmo pedido'
);
select is(
  (select count(*)::int from public.orders where idempotency_key = 'ord-key-0000000000001'),
  1,
  'reenvio não cria pedido duplicado'
);
select is(
  (select reserved_delta from tests.stock_delta('22222222-2222-4222-8222-000000000001')),
  2,
  'reenvio não reserva estoque duas vezes'
);
select throws_ok(
  $$select public.create_order(tests.order_payload('ord-key-0000000000001',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 5)), 6000), null)$$,
  'PT409', 'IDEMPOTENCY_CONFLICT', 'mesma chave com dados diferentes é rejeitada'
);

-- ---------------------------------------------------------------------------
-- Reserva
-- ---------------------------------------------------------------------------
select results_eq(
  $$select * from tests.stock_delta('22222222-2222-4222-8222-000000000001')$$,
  $$values (-2, 2)$$,
  'reserva move unidades de disponível para reservado'
);
select is(
  (select count(*)::int from public.inventory_reservations r join public.orders o on o.id = r.order_id
    where o.idempotency_key = 'ord-key-0000000000001' and r.status = 'ACTIVE'),
  2,
  'reservas ativas criadas para cada produto'
);
select is(
  (select status::text from public.orders where idempotency_key = 'ord-key-0000000000001'),
  'NEW',
  'pedido em dinheiro nasce como NEW'
);
select is(
  (public.create_order(tests.order_payload('ord-key-0000000000015',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000004', 2)), 3000, 'PIX'), null) ->> 'status'),
  'AWAITING_PAYMENT',
  'pedido PIX nasce aguardando pagamento'
);

-- ---------------------------------------------------------------------------
-- Entrega
-- ---------------------------------------------------------------------------
select is(
  (public.create_order(
    tests.order_payload('ord-key-0000000000016',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2900, 'CASH', 'DELIVERY',
      (select addr from t_addr)),
    '55555555-5555-4555-8555-000000000001') ->> 'deliveryFeeCents')::int,
  500,
  'frete de 2,5 km calculado pela faixa 0-3 km (R$ 5,00)'
);
select throws_ok(
  $$select public.create_order(
    tests.order_payload('ord-key-0000000000017',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2900, 'CASH', 'DELIVERY',
      (select addr from t_addr)), null)$$,
  'PT409', 'DELIVERY_QUOTE_INVALID', 'entrega sem cotação do servidor é rejeitada'
);
select throws_ok(
  $$select public.create_order(
    tests.order_payload('ord-key-0000000000018',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2900, 'CASH', 'DELIVERY',
      (select addr from t_addr)), '55555555-5555-4555-8555-000000000002')$$,
  'PT409', 'DELIVERY_QUOTE_INVALID', 'cotação expirada é rejeitada'
);
select throws_ok(
  $$select public.create_order(
    tests.order_payload('ord-key-0000000000019',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2900, 'CASH', 'DELIVERY',
      '{"cep":"29300000","street":"Outra Rua","number":"1","neighborhood":"Centro","city":"Cachoeiro de Itapemirim","state":"ES"}'::jsonb),
    '55555555-5555-4555-8555-000000000001')$$,
  'PT409', 'DELIVERY_QUOTE_INVALID', 'cotação de outro endereço não pode ser reaproveitada'
);
select throws_ok(
  $$select public.create_order(
    tests.order_payload('ord-key-0000000000020',
      jsonb_build_array(tests.item('22222222-2222-4222-8222-000000000001', 2)), 2400, 'CASH', 'DELIVERY',
      (select addr from t_addr)), '55555555-5555-4555-8555-000000000003')$$,
  'PT409', 'DELIVERY_UNAVAILABLE', 'endereço fora da área não gera pedido de entrega'
);

reset role;

select is(
  (public.compute_delivery_fee(3000, 1000) ->> 'feeCents')::int, 500, '3,0 km exatos ainda na faixa até 3 km');
select is(
  (public.compute_delivery_fee(3001, 1000) ->> 'feeCents')::int, 700, 'acima de 3 km vai para a próxima faixa');
select is(
  (public.compute_delivery_fee(4000, 20000) ->> 'feeCents')::int, 0, 'frete grátis acima do subtotal configurado');
select is(
  (public.compute_delivery_fee(12001, 1000) ->> 'reason'), 'OUT_OF_AREA', 'acima da distância máxima fica fora da área');

update public.store_settings set delivery_pricing_mode = 'BASE_PLUS_PER_KM', delivery_base_fee_cents = 400, delivery_per_km_cents = 120;
select is(
  (public.compute_delivery_fee(4200, 1000) ->> 'feeCents')::int, 950,
  'modo base + km: 4,00 + 4,2 x 1,20 = 9,04 arredondado para 9,50');

select * from finish();
rollback;
