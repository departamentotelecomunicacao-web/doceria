-- =============================================================================
-- Regras de negócio no banco: horários, frete, pedidos, reservas, transições,
-- pagamentos, estoque e indicadores. Todas as operações sensíveis são funções
-- SECURITY DEFINER com search_path vazio e checagem explícita de papel.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Endereços: normalização e hash de destino (fonte única; a Edge Function usa
-- esta mesma função para consultar o cache de rotas).
-- -----------------------------------------------------------------------------
create or replace function public._norm_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(
      translate(lower(coalesce(p_value, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'),
      '[^a-z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

create or replace function public._norm_street(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := public._norm_text(p_value);
begin
  v := regexp_replace(v, '^r ', 'rua ');
  v := regexp_replace(v, '^av ', 'avenida ');
  v := regexp_replace(v, '^(pc|pca|pr) ', 'praca ');
  v := regexp_replace(v, '^tv ', 'travessa ');
  v := regexp_replace(v, '^rod ', 'rodovia ');
  v := regexp_replace(v, '^al ', 'alameda ');
  v := regexp_replace(v, '^est ', 'estrada ');
  return v;
end;
$$;

-- Valida e normaliza um endereço vindo do checkout. Retorna o endereço limpo e
-- o destinationHash (sha256 do endereço normalizado, sem complemento).
create or replace function public.normalize_delivery_address(p_address jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cep text := regexp_replace(coalesce(p_address ->> 'cep', ''), '\D', '', 'g');
  v_street text := btrim(coalesce(p_address ->> 'street', ''));
  v_number text := btrim(coalesce(p_address ->> 'number', ''));
  v_complement text := nullif(btrim(coalesce(p_address ->> 'complement', '')), '');
  v_neighborhood text := btrim(coalesce(p_address ->> 'neighborhood', ''));
  v_city text := btrim(coalesce(p_address ->> 'city', ''));
  v_state text := upper(btrim(coalesce(p_address ->> 'state', '')));
  v_reference text := nullif(btrim(coalesce(p_address ->> 'reference', '')), '');
  v_key text;
begin
  if p_address is null or jsonb_typeof(p_address) <> 'object' then
    perform public.raise_app_error('INVALID_ADDRESS', 'Informe o endereço de entrega.', 400,
      jsonb_build_object('field', 'address'));
  end if;
  if v_cep !~ '^[0-9]{8}$' then
    perform public.raise_app_error('INVALID_ADDRESS', 'CEP inválido.', 400, jsonb_build_object('field', 'cep'));
  end if;
  if char_length(v_street) not between 2 and 120 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Informe a rua.', 400, jsonb_build_object('field', 'street'));
  end if;
  if char_length(v_number) not between 1 and 12 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Informe o número.', 400, jsonb_build_object('field', 'number'));
  end if;
  if v_complement is not null and char_length(v_complement) > 80 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Complemento muito longo.', 400, jsonb_build_object('field', 'complement'));
  end if;
  if char_length(v_neighborhood) not between 2 and 80 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Informe o bairro.', 400, jsonb_build_object('field', 'neighborhood'));
  end if;
  if char_length(v_city) not between 2 and 80 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Informe a cidade.', 400, jsonb_build_object('field', 'city'));
  end if;
  if v_state !~ '^[A-Z]{2}$' then
    perform public.raise_app_error('INVALID_ADDRESS', 'Estado inválido.', 400, jsonb_build_object('field', 'state'));
  end if;
  if v_reference is not null and char_length(v_reference) > 160 then
    perform public.raise_app_error('INVALID_ADDRESS', 'Ponto de referência muito longo.', 400, jsonb_build_object('field', 'reference'));
  end if;

  v_key := concat_ws('|',
    v_cep,
    public._norm_street(v_street),
    public._norm_text(v_number),
    public._norm_text(v_neighborhood),
    public._norm_text(v_city),
    lower(v_state));

  return jsonb_build_object(
    'cep', v_cep,
    'street', v_street,
    'number', v_number,
    'complement', v_complement,
    'neighborhood', v_neighborhood,
    'city', v_city,
    'state', v_state,
    'reference', v_reference,
    'destinationHash', encode(sha256(convert_to(v_key, 'UTF8')), 'hex')
  );
end;
$$;

-- Origem das rotas (privada). Usada somente pela Edge Function (service_role).
create or replace function public.get_routing_origin()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'address', s.origin_address,
    'lat', s.origin_lat,
    'lng', s.origin_lng,
    'configured', (s.origin_address <> '' or (s.origin_lat is not null and s.origin_lng is not null)),
    'hash', encode(sha256(convert_to(
      concat_ws('|', public._norm_text(s.origin_address), s.origin_lat::text, s.origin_lng::text), 'UTF8')), 'hex')
  )
  from public.store_settings s
  where s.id
$$;

-- -----------------------------------------------------------------------------
-- Horários (sempre America/Sao_Paulo, independentemente do navegador).
-- -----------------------------------------------------------------------------
create or replace function public.is_within_hours(p_hours jsonb, p_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  with local as (
    select (p_at at time zone 'America/Sao_Paulo') as ts
  )
  select exists (
    select 1
    from local,
         jsonb_array_elements(coalesce(p_hours -> extract(isodow from local.ts)::int::text, '[]'::jsonb)) w
    where local.ts::time >= (w ->> 0)::time
      and (w ->> 1 = '24:00' or local.ts::time < (w ->> 1)::time)
  )
$$;

-- Janelas disponíveis para retirada/entrega respeitando antecedência mínima,
-- dias à frente e intervalo configurados.
create or replace function public.get_fulfillment_slots(p_type public.fulfillment_type)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.store_settings;
  v_hours jsonb;
  v_local_today date;
  v_earliest timestamptz;
  v_result jsonb;
begin
  select * into s from public.store_settings where id;

  if p_type = 'DELIVERY' then
    if not s.delivery_enabled then
      return '[]'::jsonb;
    end if;
    v_hours := s.delivery_hours;
  else
    if not s.pickup_enabled then
      return '[]'::jsonb;
    end if;
    v_hours := s.business_hours;
  end if;

  v_local_today := (now() at time zone 'America/Sao_Paulo')::date;
  v_earliest := now() + make_interval(mins => s.min_lead_time_minutes);

  with days as (
    select (v_local_today + g)::date as d
    from generate_series(0, s.max_days_ahead) g
  ),
  windows as (
    select days.d,
           (w ->> 0)::time as open_t,
           case when w ->> 1 = '24:00' then interval '24 hours' else ((w ->> 1)::time)::interval end as close_i
    from days
    cross join lateral jsonb_array_elements(
      coalesce(v_hours -> extract(isodow from days.d)::int::text, '[]'::jsonb)
    ) w
  ),
  slots as (
    select (windows.d + windows.open_t + make_interval(mins => g * s.slot_interval_minutes)) as local_start,
           (windows.d + windows.close_i) as local_close
    from windows
    cross join lateral generate_series(
      0,
      ceil(extract(epoch from (windows.close_i - windows.open_t::interval)) / 60.0 / s.slot_interval_minutes)::int - 1
    ) g
  ),
  zoned as (
    select (local_start at time zone 'America/Sao_Paulo') as start_at,
           (least(local_start + make_interval(mins => s.slot_interval_minutes), local_close)
              at time zone 'America/Sao_Paulo') as end_at
    from slots
  )
  select coalesce(jsonb_agg(jsonb_build_object('start', start_at, 'end', end_at) order by start_at), '[]'::jsonb)
    into v_result
  from (
    select start_at, end_at
    from zoned
    where start_at >= v_earliest
    order by start_at
    limit 400
  ) z;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Frete: única implementação da regra de preço (usada na cotação e no pedido).
-- -----------------------------------------------------------------------------
create or replace function public.compute_delivery_fee(p_distance_m integer, p_subtotal_cents integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.store_settings;
  v_fee integer;
  v_free boolean := false;
begin
  if p_distance_m is null or p_distance_m < 0 then
    perform public.raise_app_error('INVALID_DISTANCE', 'Distância inválida.', 400);
  end if;

  select * into s from public.store_settings where id;

  if not s.delivery_enabled then
    return jsonb_build_object('available', false, 'reason', 'DELIVERY_DISABLED', 'distanceMeters', p_distance_m);
  end if;

  if p_distance_m > s.delivery_max_distance_m then
    return jsonb_build_object('available', false, 'reason', 'OUT_OF_AREA', 'distanceMeters', p_distance_m,
      'maxDistanceMeters', s.delivery_max_distance_m);
  end if;

  if s.delivery_pricing_mode = 'DISTANCE_TABLE' then
    select r.fee_cents into v_fee
    from public.delivery_rules r
    where r.is_active
      and (p_distance_m > r.min_distance_m or (r.min_distance_m = 0 and p_distance_m = 0))
      and p_distance_m <= r.max_distance_m
    order by r.min_distance_m
    limit 1;

    if v_fee is null then
      return jsonb_build_object('available', false, 'reason', 'OUT_OF_AREA', 'distanceMeters', p_distance_m,
        'maxDistanceMeters', s.delivery_max_distance_m);
    end if;
  else
    -- Taxa base + preço por km, arredondada para cima em múltiplos de R$ 0,50.
    v_fee := (ceil((s.delivery_base_fee_cents + (s.delivery_per_km_cents::numeric * p_distance_m / 1000.0)) / 50.0) * 50)::integer;
  end if;

  if s.free_delivery_min_subtotal_cents is not null
     and coalesce(p_subtotal_cents, 0) >= s.free_delivery_min_subtotal_cents then
    v_free := true;
  end if;

  return jsonb_build_object(
    'available', true,
    'distanceMeters', p_distance_m,
    'baseFeeCents', v_fee,
    'feeCents', case when v_free then 0 else v_fee end,
    'freeDeliveryApplied', v_free,
    'freeDeliveryMinSubtotalCents', s.free_delivery_min_subtotal_cents,
    'pricingMode', s.delivery_pricing_mode
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Configuração pública (sem dados privados como endereço de produção).
-- -----------------------------------------------------------------------------
create or replace function public.get_public_store_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'storeName', s.store_name,
    'tagline', s.tagline,
    'legalName', s.legal_name,
    'whatsappNumber', s.whatsapp_number,
    'instagramHandle', s.instagram_handle,
    'contactEmail', s.contact_email,
    'privacyContactEmail', coalesce(s.privacy_contact_email, s.contact_email),
    'wixSiteUrl', s.wix_site_url,
    'publicLocationLabel', s.public_location_label,
    'acceptingOrders', s.accepting_orders,
    'pauseMessage', s.pause_message,
    'pickupEnabled', s.pickup_enabled,
    'deliveryEnabled', s.delivery_enabled,
    'businessHours', s.business_hours,
    'deliveryHours', s.delivery_hours,
    'isOpenNow', public.is_within_hours(s.business_hours, now()),
    'minLeadTimeMinutes', s.min_lead_time_minutes,
    'minOrderCents', s.min_order_cents,
    'freeDeliveryMinSubtotalCents', s.free_delivery_min_subtotal_cents,
    'deliveryMaxDistanceMeters', s.delivery_max_distance_m,
    'deliveryPricing', jsonb_build_object(
      'mode', s.delivery_pricing_mode,
      'baseFeeCents', s.delivery_base_fee_cents,
      'perKmCents', s.delivery_per_km_cents,
      'rules', coalesce((
        select jsonb_agg(jsonb_build_object(
          'minDistanceMeters', r.min_distance_m,
          'maxDistanceMeters', r.max_distance_m,
          'feeCents', r.fee_cents) order by r.min_distance_m)
        from public.delivery_rules r
        where r.is_active
      ), '[]'::jsonb)
    ),
    'paymentMethods', to_jsonb(s.payment_methods),
    'content', s.content,
    'timezone', 'America/Sao_Paulo',
    'serverTime', now()
  )
  from public.store_settings s
  where s.id
$$;

-- -----------------------------------------------------------------------------
-- Status do pedido e do pagamento (separados). Fonte única das transições.
-- -----------------------------------------------------------------------------
create or replace function public.order_next_statuses(
  p_status public.order_status,
  p_type public.fulfillment_type
)
returns public.order_status[]
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'NEW' then array['AWAITING_PAYMENT', 'CONFIRMED', 'CANCELED']::public.order_status[]
    when 'AWAITING_PAYMENT' then array['CONFIRMED', 'CANCELED']::public.order_status[]
    when 'CONFIRMED' then array['PREPARING', 'CANCELED']::public.order_status[]
    when 'PREPARING' then array['READY', 'CANCELED']::public.order_status[]
    when 'READY' then case p_type
      when 'DELIVERY' then array['OUT_FOR_DELIVERY', 'CANCELED']::public.order_status[]
      else array['COMPLETED', 'CANCELED']::public.order_status[]
    end
    when 'OUT_FOR_DELIVERY' then array['COMPLETED', 'READY', 'CANCELED']::public.order_status[]
    else array[]::public.order_status[]
  end
$$;

create or replace function public.payment_next_statuses(p_status public.payment_status)
returns public.payment_status[]
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'PENDING' then array['MANUAL_CONFIRMATION', 'PAID', 'FAILED']::public.payment_status[]
    when 'MANUAL_CONFIRMATION' then array['PAID', 'FAILED', 'PENDING']::public.payment_status[]
    when 'FAILED' then array['PENDING', 'PAID']::public.payment_status[]
    when 'PAID' then array['REFUNDED']::public.payment_status[]
    else array[]::public.payment_status[]
  end
$$;

-- -----------------------------------------------------------------------------
-- Reservas
-- -----------------------------------------------------------------------------
create or replace function public._release_order_reservations(
  p_order_id uuid,
  p_new_status public.reservation_status,
  p_reason text,
  p_source text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select ir.id, ir.product_id, ir.quantity
    from public.inventory_reservations ir
    where ir.order_id = p_order_id and ir.status = 'ACTIVE'
    order by ir.product_id
    for update
  loop
    perform public._apply_stock_change(
      r.product_id, r.quantity, -r.quantity, 'RELEASE', r.quantity,
      p_reason, p_order_id, r.id, p_actor_id, p_source);
    update public.inventory_reservations
       set status = p_new_status, resolved_at = now()
     where id = r.id;
  end loop;
end;
$$;

create or replace function public._consume_order_reservations(
  p_order_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_found boolean := false;
begin
  for r in
    select ir.id, ir.product_id, ir.quantity
    from public.inventory_reservations ir
    where ir.order_id = p_order_id and ir.status = 'ACTIVE'
    order by ir.product_id
    for update
  loop
    v_found := true;
    perform public._apply_stock_change(
      r.product_id, 0, -r.quantity, 'OUT', r.quantity,
      p_reason, p_order_id, r.id, p_actor_id, 'ORDER');
    update public.inventory_reservations
       set status = 'CONSUMED', resolved_at = now()
     where id = r.id;
  end loop;

  if not v_found then
    perform public.raise_app_error('RESERVATION_NOT_ACTIVE',
      'As reservas deste pedido não estão mais ativas.', 409);
  end if;
end;
$$;

create or replace function public._restock_consumed_order(
  p_order_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select ir.id, ir.product_id, ir.quantity
    from public.inventory_reservations ir
    where ir.order_id = p_order_id and ir.status = 'CONSUMED'
    order by ir.product_id
  loop
    perform public._apply_stock_change(
      r.product_id, r.quantity, 0, 'IN', r.quantity,
      p_reason, p_order_id, r.id, p_actor_id, 'ORDER');
  end loop;
end;
$$;

-- Expira pedidos NEW/AWAITING_PAYMENT vencidos e devolve o estoque reservado.
-- Executada pelo pg_cron a cada minuto e, oportunisticamente, antes de cada
-- nova reserva dos mesmos produtos (caso o agendador atrase).
create or replace function public.expire_stale_orders(p_product_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_count integer := 0;
begin
  for v_order in
    select o.id, o.code, o.status
    from public.orders o
    where o.status in ('NEW', 'AWAITING_PAYMENT')
      and o.expires_at <= now()
      and (
        p_product_ids is null
        or exists (
          select 1 from public.inventory_reservations ir
          where ir.order_id = o.id and ir.status = 'ACTIVE' and ir.product_id = any (p_product_ids)
        )
      )
    order by o.expires_at
    limit 500
    for update of o skip locked
  loop
    perform public._release_order_reservations(
      v_order.id, 'EXPIRED', 'Reserva expirada do pedido #' || v_order.code, 'SYSTEM', null);

    update public.orders set status = 'EXPIRED' where id = v_order.id;

    insert into public.order_status_history (order_id, from_status, to_status, source, note)
    values (
      v_order.id, v_order.status, 'EXPIRED', 'SYSTEM',
      case when v_order.status = 'AWAITING_PAYMENT'
        then 'Prazo de pagamento encerrado'
        else 'Prazo de confirmação encerrado'
      end
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create or replace function public._generate_order_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY2346789';
  v_bytes bytea;
  v_code text;
  i integer;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.orders o where o.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public._order_summary(p_order_id uuid, p_replayed boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orderId', o.id,
    'code', o.code,
    'publicToken', o.public_token,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'fulfillmentType', o.fulfillment_type,
    'scheduledFor', o.scheduled_for,
    'subtotalCents', o.subtotal_cents,
    'deliveryFeeCents', o.delivery_fee_cents,
    'discountCents', o.discount_cents,
    'totalCents', o.total_cents,
    'expiresAt', o.expires_at,
    'createdAt', o.created_at,
    'replayed', p_replayed
  )
  from public.orders o
  where o.id = p_order_id
$$;

-- Núcleo da criação de pedido. Recebe apenas IDs e quantidades; preços,
-- subtotal, frete e total são sempre recalculados aqui. Operação atômica:
-- trava os produtos (ordem estável para evitar deadlock), confere estoque,
-- cria pedido, itens (com snapshots), reservas e movimentos.
create or replace function public._create_order(p_payload jsonb, p_ctx jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.store_settings;
  v_source public.order_source;
  v_is_admin boolean;
  v_actor uuid := nullif(p_ctx ->> 'actorId', '')::uuid;
  v_key text := p_payload ->> 'idempotencyKey';
  v_fingerprint text;
  v_existing public.orders;
  v_type public.fulfillment_type;
  v_method public.payment_method;
  v_scheduled timestamptz;
  v_name text := btrim(coalesce(p_payload #>> '{customer,name}', ''));
  v_phone text := btrim(coalesce(p_payload #>> '{customer,phone}', ''));
  v_email text := nullif(lower(btrim(coalesce(p_payload #>> '{customer,email}', ''))), '');
  v_notes text := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_cash_change integer;
  v_expected_total integer;
  v_manual_fee integer;
  v_items jsonb;
  v_item_count integer;
  v_product_ids uuid[];
  v_product record;
  v_problems jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_fee integer := 0;
  v_fee_info jsonb;
  v_is_manual_fee boolean := false;
  v_quote public.delivery_quotes;
  v_address jsonb;
  v_origin jsonb;
  v_total bigint;
  v_customer_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_code text;
  v_status public.order_status;
  v_expires timestamptz;
  v_reservation_id uuid;
begin
  -- 1. Formato básico ---------------------------------------------------------
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Dados do pedido inválidos.', 400);
  end if;

  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{16,100}$' then
    perform public.raise_app_error('INVALID_IDEMPOTENCY_KEY', 'Identificador da solicitação inválido.', 400);
  end if;

  if jsonb_typeof(p_payload -> 'items') is distinct from 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    perform public.raise_app_error('EMPTY_CART', 'Seu carrinho está vazio.', 400);
  end if;
  if jsonb_array_length(p_payload -> 'items') > 60 then
    perform public.raise_app_error('TOO_MANY_ITEMS', 'O pedido tem itens demais.', 400);
  end if;

  begin
    v_source := coalesce(nullif(p_ctx ->> 'source', ''), 'STOREFRONT')::public.order_source;
    v_type := (p_payload #>> '{fulfillment,type}')::public.fulfillment_type;
    v_method := (p_payload ->> 'paymentMethod')::public.payment_method;
    v_scheduled := nullif(p_payload #>> '{fulfillment,scheduledFor}', '')::timestamptz;
    v_cash_change := nullif(p_payload ->> 'cashChangeForCents', '')::integer;
    v_expected_total := nullif(p_payload ->> 'expectedTotalCents', '')::integer;
    v_manual_fee := nullif(p_ctx ->> 'manualDeliveryFeeCents', '')::integer;

    if exists (
      select 1
      from jsonb_array_elements(p_payload -> 'items') e
      where jsonb_typeof(e) <> 'object'
         or (e ->> 'productId') is null
         or jsonb_typeof(e -> 'quantity') <> 'number'
         or (e ->> 'quantity')::integer < 1
         or (e ->> 'quantity')::integer > 500
    ) then
      perform public.raise_app_error('INVALID_QUANTITY', 'Quantidade inválida.', 400);
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('productId', agg.pid, 'quantity', agg.qty) order by agg.pid), '[]'::jsonb),
           count(*),
           array_agg(agg.pid order by agg.pid)
      into v_items, v_item_count, v_product_ids
    from (
      select (e ->> 'productId')::uuid as pid, sum((e ->> 'quantity')::integer)::integer as qty
      from jsonb_array_elements(p_payload -> 'items') e
      group by 1
    ) agg;
  exception
    when data_exception then
      perform public.raise_app_error('INVALID_PAYLOAD', 'Dados do pedido inválidos.', 400);
  end;

  v_is_admin := v_source = 'ADMIN';

  if v_type is null or v_method is null then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Escolha a forma de recebimento e de pagamento.', 400);
  end if;
  if v_item_count > 30 then
    perform public.raise_app_error('TOO_MANY_ITEMS', 'O pedido tem itens demais.', 400);
  end if;
  if exists (select 1 from jsonb_to_recordset(v_items) as i(quantity integer) where i.quantity > 500) then
    perform public.raise_app_error('INVALID_QUANTITY', 'Quantidade inválida.', 400);
  end if;
  if char_length(v_name) not between 2 and 120 then
    perform public.raise_app_error('INVALID_CUSTOMER', 'Informe seu nome.', 400, jsonb_build_object('field', 'name'));
  end if;
  if v_phone !~ '^\+55[1-9][0-9]{9,10}$' then
    perform public.raise_app_error('INVALID_CUSTOMER', 'Telefone inválido.', 400, jsonb_build_object('field', 'phone'));
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    perform public.raise_app_error('INVALID_CUSTOMER', 'E-mail inválido.', 400, jsonb_build_object('field', 'email'));
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Observação muito longa.', 400, jsonb_build_object('field', 'notes'));
  end if;

  if v_type = 'DELIVERY' then
    v_address := public.normalize_delivery_address(p_payload #> '{fulfillment,address}');
  end if;

  -- 2. Idempotência -----------------------------------------------------------
  v_fingerprint := md5(jsonb_build_object(
    'source', v_source,
    'name', v_name,
    'phone', v_phone,
    'email', v_email,
    'type', v_type,
    'scheduledFor', v_scheduled,
    'destinationHash', v_address ->> 'destinationHash',
    'method', v_method,
    'cashChange', v_cash_change,
    'notes', v_notes,
    'items', v_items
  )::text);

  perform pg_advisory_xact_lock(hashtextextended('order-idempotency:' || v_key, 0));

  select * into v_existing from public.orders o where o.idempotency_key = v_key;
  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      perform public.raise_app_error('IDEMPOTENCY_CONFLICT',
        'Esta solicitação já foi usada com outros dados. Atualize a página e tente novamente.', 409);
    end if;
    return public._order_summary(v_existing.id, true);
  end if;

  -- 3. Regras da loja ---------------------------------------------------------
  select * into s from public.store_settings where id;

  if not v_is_admin then
    if not s.accepting_orders then
      perform public.raise_app_error('STORE_PAUSED',
        coalesce(nullif(s.pause_message, ''), 'No momento não estamos recebendo pedidos.'), 409);
    end if;
    if v_type = 'PICKUP' and not s.pickup_enabled then
      perform public.raise_app_error('PICKUP_UNAVAILABLE', 'Retirada indisponível no momento.', 409);
    end if;
    if v_type = 'DELIVERY' and not s.delivery_enabled then
      perform public.raise_app_error('DELIVERY_UNAVAILABLE', 'Entrega indisponível no momento.', 409,
        jsonb_build_object('reason', 'DELIVERY_DISABLED'));
    end if;
    if not (v_method = any (s.payment_methods)) then
      perform public.raise_app_error('PAYMENT_METHOD_UNAVAILABLE', 'Forma de pagamento indisponível.', 409);
    end if;
  end if;

  -- 4. Estoque (trava produtos em ordem estável) -------------------------------
  perform public.expire_stale_orders(v_product_ids);

  perform 1
  from public.products p
  where p.id = any (v_product_ids)
  order by p.id
  for update;

  for v_product in
    select i."productId" as product_id,
           i.quantity,
           p.id as found_id,
           p.name,
           p.price_cents,
           p.stock_available,
           p.is_active,
           p.max_per_order
    from jsonb_to_recordset(v_items) as i("productId" uuid, quantity integer)
    left join public.products p on p.id = i."productId"
    order by i."productId"
  loop
    if v_product.found_id is null or not v_product.is_active then
      v_problems := v_problems || jsonb_build_object(
        'productId', v_product.product_id, 'code', 'PRODUCT_UNAVAILABLE', 'name', v_product.name);
    elsif v_product.quantity > v_product.max_per_order then
      v_problems := v_problems || jsonb_build_object(
        'productId', v_product.product_id, 'code', 'QUANTITY_LIMIT', 'name', v_product.name,
        'max', v_product.max_per_order, 'requested', v_product.quantity);
    elsif v_product.quantity > v_product.stock_available then
      v_problems := v_problems || jsonb_build_object(
        'productId', v_product.product_id, 'code', 'OUT_OF_STOCK', 'name', v_product.name,
        'available', v_product.stock_available, 'requested', v_product.quantity);
    else
      v_subtotal := v_subtotal + v_product.price_cents::bigint * v_product.quantity;
    end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then
    if v_problems @> '[{"code":"PRODUCT_UNAVAILABLE"}]' then
      perform public.raise_app_error('PRODUCT_UNAVAILABLE',
        'Um ou mais produtos não estão mais disponíveis.', 409, jsonb_build_object('problems', v_problems));
    elsif v_problems @> '[{"code":"OUT_OF_STOCK"}]' then
      perform public.raise_app_error('OUT_OF_STOCK',
        'Não há estoque suficiente para um ou mais produtos.', 409, jsonb_build_object('problems', v_problems));
    else
      perform public.raise_app_error('QUANTITY_LIMIT',
        'Quantidade acima do limite por pedido.', 409, jsonb_build_object('problems', v_problems));
    end if;
  end if;

  if v_subtotal > 100000000 then
    perform public.raise_app_error('ORDER_TOO_LARGE', 'Pedido acima do limite permitido.', 400);
  end if;

  if not v_is_admin and v_subtotal < s.min_order_cents then
    perform public.raise_app_error('BELOW_MINIMUM_ORDER', 'O pedido não atingiu o valor mínimo.', 409,
      jsonb_build_object('minOrderCents', s.min_order_cents, 'subtotalCents', v_subtotal));
  end if;

  -- 5. Janela de retirada/entrega ---------------------------------------------
  if not v_is_admin then
    if v_scheduled is null or not exists (
      select 1
      from jsonb_array_elements(public.get_fulfillment_slots(v_type)) e
      where (e ->> 'start')::timestamptz = v_scheduled
    ) then
      perform public.raise_app_error('SLOT_UNAVAILABLE',
        'O horário escolhido não está mais disponível. Escolha outro horário.', 409);
    end if;
  elsif v_scheduled is null then
    v_scheduled := now();
  end if;

  -- 6. Frete (recalculado no servidor) -----------------------------------------
  if v_type = 'DELIVERY' then
    if v_is_admin and v_manual_fee is not null then
      if v_manual_fee < 0 or v_manual_fee > 100000 then
        perform public.raise_app_error('INVALID_DELIVERY_FEE', 'Taxa de entrega inválida.', 400);
      end if;
      v_fee := v_manual_fee;
      v_is_manual_fee := true;
    else
      v_origin := public.get_routing_origin();
      select * into v_quote
      from public.delivery_quotes q
      where q.id = nullif(p_ctx ->> 'quoteId', '')::uuid;

      if not found
         or v_quote.status <> 'OK'
         or v_quote.expires_at <= now()
         or v_quote.destination_hash <> (v_address ->> 'destinationHash')
         or v_quote.origin_hash <> (v_origin ->> 'hash') then
        perform public.raise_app_error('DELIVERY_QUOTE_INVALID',
          'Não foi possível confirmar o frete para este endereço. Recalcule a entrega.', 409);
      end if;

      v_fee_info := public.compute_delivery_fee(v_quote.distance_meters, v_subtotal::integer);
      if not (v_fee_info ->> 'available')::boolean then
        perform public.raise_app_error('DELIVERY_UNAVAILABLE',
          'Este endereço está fora da nossa área de entrega.', 409,
          jsonb_build_object('reason', v_fee_info ->> 'reason'));
      end if;
      v_fee := (v_fee_info ->> 'feeCents')::integer;
    end if;
  end if;

  v_total := v_subtotal + v_fee;

  -- 7. Preço exibido x preço real: nunca cobrar valor diferente do confirmado.
  if not v_is_admin then
    if v_expected_total is null then
      perform public.raise_app_error('INVALID_PAYLOAD', 'Total esperado não informado.', 400);
    end if;
    if v_expected_total <> v_total then
      perform public.raise_app_error('PRICE_CHANGED',
        'Os valores do pedido foram atualizados. Confira o novo total antes de confirmar.', 409,
        jsonb_build_object(
          'subtotalCents', v_subtotal,
          'deliveryFeeCents', v_fee,
          'totalCents', v_total,
          'items', (
            select jsonb_agg(jsonb_build_object('productId', p.id, 'unitPriceCents', p.price_cents))
            from public.products p where p.id = any (v_product_ids)
          )));
    end if;
  end if;

  if v_method <> 'CASH' then
    v_cash_change := null;
  elsif v_cash_change is not null and v_cash_change < v_total then
    perform public.raise_app_error('INVALID_CASH_CHANGE', 'O valor para troco deve ser maior que o total.', 400);
  end if;

  -- 8. Cliente -----------------------------------------------------------------
  insert into public.customers (name, phone, email)
  values (v_name, v_phone, v_email)
  on conflict (phone) do update
    set name = excluded.name,
        email = coalesce(excluded.email, public.customers.email)
  returning id into v_customer_id;

  if v_type = 'DELIVERY' then
    insert into public.customer_addresses (
      customer_id, cep, street, number, complement, neighborhood, city, state, reference, destination_hash
    ) values (
      v_customer_id, v_address ->> 'cep', v_address ->> 'street', v_address ->> 'number',
      v_address ->> 'complement', v_address ->> 'neighborhood', v_address ->> 'city',
      v_address ->> 'state', v_address ->> 'reference', v_address ->> 'destinationHash'
    )
    on conflict (customer_id, destination_hash) do update
      set last_used_at = now(),
          complement = excluded.complement,
          reference = excluded.reference;
  end if;

  -- 9. Pedido ------------------------------------------------------------------
  v_code := public._generate_order_code();
  if v_method = 'PIX' then
    v_status := 'AWAITING_PAYMENT';
    v_expires := now() + make_interval(mins => s.payment_ttl_minutes);
  else
    v_status := 'NEW';
    v_expires := now() + make_interval(mins => s.new_order_ttl_minutes);
  end if;

  insert into public.orders (
    id, code, public_token, idempotency_key, request_fingerprint, source, status,
    payment_status, payment_method, fulfillment_type, customer_id, customer_name,
    customer_phone, customer_email, delivery_address, delivery_destination_hash,
    delivery_quote_id, delivery_distance_meters, delivery_duration_seconds,
    delivery_fee_is_manual, scheduled_for, subtotal_cents, delivery_fee_cents,
    discount_cents, total_cents, cash_change_for_cents, customer_notes, expires_at, created_by
  ) values (
    v_order_id, v_code, encode(extensions.gen_random_bytes(24), 'hex'), v_key, v_fingerprint,
    v_source, v_status, 'PENDING', v_method, v_type, v_customer_id, v_name, v_phone, v_email,
    case when v_type = 'DELIVERY' then v_address - 'destinationHash' end,
    v_address ->> 'destinationHash',
    v_quote.id, v_quote.distance_meters, v_quote.duration_seconds,
    v_is_manual_fee, v_scheduled, v_subtotal::integer, v_fee, 0, v_total::integer,
    v_cash_change, v_notes, v_expires, v_actor
  );

  for v_product in
    select i."productId" as product_id, i.quantity, p.name, p.price_cents
    from jsonb_to_recordset(v_items) as i("productId" uuid, quantity integer)
    join public.products p on p.id = i."productId"
    order by i."productId"
  loop
    insert into public.order_items (
      order_id, product_id, product_name_snapshot, unit_price_cents_snapshot, quantity, line_total_cents
    ) values (
      v_order_id, v_product.product_id, v_product.name, v_product.price_cents,
      v_product.quantity, v_product.price_cents * v_product.quantity
    );

    insert into public.inventory_reservations (order_id, product_id, quantity, expires_at)
    values (v_order_id, v_product.product_id, v_product.quantity, v_expires)
    returning id into v_reservation_id;

    perform public._apply_stock_change(
      v_product.product_id, -v_product.quantity, v_product.quantity, 'RESERVATION',
      v_product.quantity, 'Reserva do pedido #' || v_code, v_order_id, v_reservation_id,
      v_actor, 'ORDER');
  end loop;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, source, note)
  values (
    v_order_id, null, v_status, v_actor,
    case when v_is_admin then 'ADMIN' else 'CUSTOMER' end,
    case when v_is_admin then 'Pedido registrado pela equipe' else 'Pedido criado pela loja online' end
  );

  insert into public.payment_records (order_id, provider, method, status, amount_cents, actor_id, note)
  values (v_order_id, 'MANUAL', v_method, 'PENDING', v_total::integer, v_actor, null);

  if v_is_admin then
    perform public.write_audit_log('orders.created', 'orders', v_order_id::text,
      'Pedido #' || v_code || ' registrado pela equipe', null);
  end if;

  return public._order_summary(v_order_id, false);
end;
$$;

-- Chamado somente pela Edge Function create-order (service_role), que já
-- aplicou rate limit e obteve/validou a cotação de rota.
create or replace function public.create_order(p_payload jsonb, p_quote_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public._create_order(
    p_payload,
    jsonb_build_object('source', 'STOREFRONT', 'quoteId', p_quote_id)
  );
end;
$$;

-- Pedido registrado pela equipe (ex.: pedido que chegou pelo WhatsApp).
-- Permite frete manual e dispensa janela/pedido mínimo, mas respeita estoque.
create or replace function public.admin_create_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
begin
  v_actor := public.require_role('OPERATOR');
  return public._create_order(
    p_payload,
    jsonb_build_object(
      'source', 'ADMIN',
      'actorId', v_actor,
      'manualDeliveryFeeCents', p_payload -> 'manualDeliveryFeeCents'
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Página pública do pedido (acesso por token secreto, sem login).
-- -----------------------------------------------------------------------------
create or replace function public.get_public_order(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
  s public.store_settings;
  v_address jsonb;
  v_number text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then
    return null;
  end if;

  select * into o from public.orders where public_token = p_token;
  if not found then
    return null;
  end if;

  select * into s from public.store_settings where id;

  if o.fulfillment_type = 'DELIVERY' and o.delivery_address is not null then
    v_number := coalesce(o.delivery_address ->> 'number', '');
    v_address := jsonb_build_object(
      'street', o.delivery_address ->> 'street',
      'numberMasked', case when char_length(v_number) <= 1 then '•' else left(v_number, 1) || repeat('•', char_length(v_number) - 1) end,
      'neighborhood', o.delivery_address ->> 'neighborhood',
      'city', o.delivery_address ->> 'city',
      'state', o.delivery_address ->> 'state'
    );
  end if;

  return jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'fulfillmentType', o.fulfillment_type,
    'scheduledFor', o.scheduled_for,
    'createdAt', o.created_at,
    'expiresAt', case when o.status in ('NEW', 'AWAITING_PAYMENT') then o.expires_at end,
    'customerFirstName', split_part(o.customer_name, ' ', 1),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', oi.product_name_snapshot,
        'quantity', oi.quantity,
        'unitPriceCents', oi.unit_price_cents_snapshot,
        'lineTotalCents', oi.line_total_cents) order by oi.product_name_snapshot), '[]'::jsonb)
      from public.order_items oi
      where oi.order_id = o.id
    ),
    'subtotalCents', o.subtotal_cents,
    'deliveryFeeCents', o.delivery_fee_cents,
    'discountCents', o.discount_cents,
    'totalCents', o.total_cents,
    'cashChangeForCents', o.cash_change_for_cents,
    'deliveryAddress', v_address,
    'pickup', case
      when o.fulfillment_type = 'PICKUP' and o.status not in ('CANCELED', 'EXPIRED')
      then jsonb_build_object('address', nullif(s.pickup_address, ''), 'instructions', nullif(s.pickup_instructions, ''))
    end,
    'pix', case
      when o.payment_method = 'PIX'
        and o.payment_status in ('PENDING', 'MANUAL_CONFIRMATION', 'FAILED')
        and o.status not in ('CANCELED', 'EXPIRED')
        and s.pix_key <> ''
      then jsonb_build_object('key', s.pix_key, 'holderName', nullif(s.pix_holder_name, ''))
    end,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) order by h.created_at), '[]'::jsonb)
      from public.order_status_history h
      where h.order_id = o.id
    ),
    'store', jsonb_build_object('name', s.store_name, 'whatsappNumber', s.whatsapp_number)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel: detalhe do pedido
-- -----------------------------------------------------------------------------
create or replace function public.admin_get_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  perform public.require_role('OPERATOR');

  select * into o from public.orders where id = p_order_id;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;

  return jsonb_build_object(
    'id', o.id,
    'code', o.code,
    'publicToken', o.public_token,
    'source', o.source,
    'status', o.status,
    'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method,
    'fulfillmentType', o.fulfillment_type,
    'customerId', o.customer_id,
    'customerName', o.customer_name,
    'customerPhone', o.customer_phone,
    'customerEmail', o.customer_email,
    'deliveryAddress', o.delivery_address,
    'deliveryDistanceMeters', o.delivery_distance_meters,
    'deliveryDurationSeconds', o.delivery_duration_seconds,
    'deliveryFeeIsManual', o.delivery_fee_is_manual,
    'scheduledFor', o.scheduled_for,
    'subtotalCents', o.subtotal_cents,
    'deliveryFeeCents', o.delivery_fee_cents,
    'discountCents', o.discount_cents,
    'totalCents', o.total_cents,
    'cashChangeForCents', o.cash_change_for_cents,
    'customerNotes', o.customer_notes,
    'internalNotes', o.internal_notes,
    'expiresAt', o.expires_at,
    'confirmedAt', o.confirmed_at,
    'completedAt', o.completed_at,
    'canceledAt', o.canceled_at,
    'cancelReason', o.cancel_reason,
    'createdAt', o.created_at,
    'updatedAt', o.updated_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'productId', oi.product_id,
        'name', oi.product_name_snapshot,
        'quantity', oi.quantity,
        'unitPriceCents', oi.unit_price_cents_snapshot,
        'lineTotalCents', oi.line_total_cents) order by oi.product_name_snapshot), '[]'::jsonb)
      from public.order_items oi where oi.order_id = o.id
    ),
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', h.id,
        'fromStatus', h.from_status,
        'toStatus', h.to_status,
        'source', h.source,
        'note', h.note,
        'actorName', nullif(p.full_name, ''),
        'createdAt', h.created_at) order by h.created_at, h.id), '[]'::jsonb)
      from public.order_status_history h
      left join public.profiles p on p.id = h.actor_id
      where h.order_id = o.id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'provider', pr.provider,
        'method', pr.method,
        'status', pr.status,
        'amountCents', pr.amount_cents,
        'note', pr.note,
        'actorName', nullif(p.full_name, ''),
        'createdAt', pr.created_at) order by pr.created_at), '[]'::jsonb)
      from public.payment_records pr
      left join public.profiles p on p.id = pr.actor_id
      where pr.order_id = o.id
    ),
    'reservations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productId', ir.product_id,
        'quantity', ir.quantity,
        'status', ir.status,
        'expiresAt', ir.expires_at) order by ir.product_id), '[]'::jsonb)
      from public.inventory_reservations ir where ir.order_id = o.id
    ),
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action', a.action,
        'summary', a.summary,
        'actorName', nullif(p.full_name, ''),
        'createdAt', a.created_at) order by a.created_at), '[]'::jsonb)
      from public.audit_logs a
      left join public.profiles p on p.id = a.actor_id
      where a.entity_type = 'orders' and a.entity_id = o.id::text
    ),
    'allowedNextStatuses', to_jsonb(public.order_next_statuses(o.status, o.fulfillment_type)),
    'allowedPaymentStatuses', to_jsonb(public.payment_next_statuses(o.payment_status))
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel: mudança de status (com efeitos no estoque)
-- -----------------------------------------------------------------------------
create or replace function public.admin_transition_order(
  p_order_id uuid,
  p_to_status public.order_status,
  p_note text default null,
  p_restock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  o public.orders;
  s public.store_settings;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_expires timestamptz;
begin
  v_actor := public.require_role('OPERATOR');

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;

  if not (p_to_status = any (public.order_next_statuses(o.status, o.fulfillment_type))) then
    perform public.raise_app_error('INVALID_TRANSITION',
      'Esta mudança de status não é permitida a partir do status atual.', 409,
      jsonb_build_object(
        'from', o.status,
        'to', p_to_status,
        'allowed', to_jsonb(public.order_next_statuses(o.status, o.fulfillment_type))));
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    perform public.raise_app_error('INVALID_NOTE', 'Observação muito longa.', 400);
  end if;

  if p_to_status = 'CANCELED' and (v_note is null or char_length(v_note) < 3) then
    perform public.raise_app_error('CANCEL_REASON_REQUIRED', 'Informe o motivo do cancelamento.', 400);
  end if;

  select * into s from public.store_settings where id;

  case p_to_status
    when 'AWAITING_PAYMENT' then
      v_expires := now() + make_interval(mins => s.payment_ttl_minutes);
      update public.orders set expires_at = v_expires where id = o.id;
      update public.inventory_reservations
         set expires_at = v_expires
       where order_id = o.id and status = 'ACTIVE';
    when 'CONFIRMED' then
      perform public._consume_order_reservations(o.id, 'Venda confirmada: pedido #' || o.code, v_actor);
      update public.orders set confirmed_at = now(), expires_at = null where id = o.id;
    when 'COMPLETED' then
      update public.orders set completed_at = now() where id = o.id;
    when 'CANCELED' then
      if o.status in ('NEW', 'AWAITING_PAYMENT') then
        perform public._release_order_reservations(
          o.id, 'RELEASED', 'Cancelamento do pedido #' || o.code, 'ORDER', v_actor);
      elsif p_restock then
        perform public._restock_consumed_order(o.id, 'Estorno do pedido cancelado #' || o.code, v_actor);
      end if;
      update public.orders
         set canceled_at = now(), cancel_reason = v_note, expires_at = null
       where id = o.id;
    else
      null;
  end case;

  update public.orders set status = p_to_status where id = o.id;

  insert into public.order_status_history (order_id, from_status, to_status, actor_id, source, note)
  values (o.id, o.status, p_to_status, v_actor, 'ADMIN', v_note);

  perform public.write_audit_log(
    case when p_to_status = 'CANCELED' then 'orders.canceled' else 'orders.status_changed' end,
    'orders', o.id::text,
    format('Pedido #%s: %s → %s', o.code, o.status, p_to_status)
      || case when p_to_status = 'CANCELED' and o.status not in ('NEW', 'AWAITING_PAYMENT')
           then case when p_restock then ' (estoque devolvido)' else ' (sem devolução de estoque)' end
           else '' end,
    jsonb_build_object('from', o.status, 'to', p_to_status, 'restock', p_restock));

  return public.admin_get_order(o.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel: status de pagamento (manual). Nunca definido pelo navegador do
-- cliente; futuros gateways confirmam via webhook com service_role.
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_payment_status(
  p_order_id uuid,
  p_status public.payment_status,
  p_note text default null,
  p_confirm_order boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  o public.orders;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  v_actor := public.require_role('OPERATOR');

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;

  if not (p_status = any (public.payment_next_statuses(o.payment_status))) then
    perform public.raise_app_error('INVALID_PAYMENT_TRANSITION',
      'Esta mudança de pagamento não é permitida a partir do status atual.', 409,
      jsonb_build_object('from', o.payment_status, 'to', p_status,
        'allowed', to_jsonb(public.payment_next_statuses(o.payment_status))));
  end if;

  if v_note is not null and char_length(v_note) > 500 then
    perform public.raise_app_error('INVALID_NOTE', 'Observação muito longa.', 400);
  end if;

  insert into public.payment_records (order_id, provider, method, status, amount_cents, actor_id, note)
  values (o.id, 'MANUAL', o.payment_method, p_status, o.total_cents, v_actor, v_note);

  update public.orders set payment_status = p_status where id = o.id;

  perform public.write_audit_log('orders.payment_status_changed', 'orders', o.id::text,
    format('Pagamento do pedido #%s: %s → %s', o.code, o.payment_status, p_status),
    jsonb_build_object('from', o.payment_status, 'to', p_status));

  if p_confirm_order and p_status = 'PAID' and o.status in ('NEW', 'AWAITING_PAYMENT') then
    perform public.admin_transition_order(o.id, 'CONFIRMED', 'Pagamento confirmado', true);
  end if;

  return public.admin_get_order(o.id);
end;
$$;

-- Frete manual (ex.: API de rotas indisponível ou ajuste combinado).
create or replace function public.admin_update_delivery_fee(
  p_order_id uuid,
  p_fee_cents integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  o public.orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  v_actor := public.require_role('ADMIN');

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
  if o.fulfillment_type <> 'DELIVERY' then
    perform public.raise_app_error('NOT_A_DELIVERY', 'Este pedido é de retirada.', 409);
  end if;
  if o.status in ('COMPLETED', 'CANCELED', 'EXPIRED') then
    perform public.raise_app_error('ORDER_CLOSED', 'Este pedido já foi encerrado.', 409);
  end if;
  if o.payment_status in ('PAID', 'REFUNDED') then
    perform public.raise_app_error('ORDER_ALREADY_PAID', 'O pagamento deste pedido já foi confirmado.', 409);
  end if;
  if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > 100000 then
    perform public.raise_app_error('INVALID_DELIVERY_FEE', 'Taxa de entrega inválida.', 400);
  end if;
  if v_reason is null or char_length(v_reason) < 3 then
    perform public.raise_app_error('REASON_REQUIRED', 'Informe o motivo do ajuste.', 400);
  end if;

  update public.orders
     set delivery_fee_cents = p_fee_cents,
         total_cents = subtotal_cents + p_fee_cents - discount_cents,
         delivery_fee_is_manual = true
   where id = o.id;

  perform public.write_audit_log('orders.delivery_fee_changed', 'orders', o.id::text,
    format('Frete do pedido #%s alterado de %s para %s centavos: %s', o.code, o.delivery_fee_cents, p_fee_cents, v_reason),
    jsonb_build_object('from', o.delivery_fee_cents, 'to', p_fee_cents));

  return public.admin_get_order(o.id);
end;
$$;

create or replace function public.admin_update_order_notes(p_order_id uuid, p_internal_notes text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_role('OPERATOR');
  if p_internal_notes is not null and char_length(p_internal_notes) > 2000 then
    perform public.raise_app_error('INVALID_NOTE', 'Anotação muito longa.', 400);
  end if;
  update public.orders
     set internal_notes = nullif(btrim(coalesce(p_internal_notes, '')), '')
   where id = p_order_id;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
  return public.admin_get_order(p_order_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Estoque manual: entrada, saída e ajuste (sempre com motivo).
-- IN/OUT: p_quantity é a quantidade movimentada.
-- ADJUSTMENT: p_quantity é o novo total disponível (contagem física).
-- -----------------------------------------------------------------------------
create or replace function public.inventory_adjust(
  p_product_id uuid,
  p_type public.inventory_movement_type,
  p_quantity integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_available integer;
  v_name text;
  v_delta integer;
  v_result record;
begin
  v_actor := public.require_role('OPERATOR');

  if p_type not in ('IN', 'OUT', 'ADJUSTMENT') then
    perform public.raise_app_error('INVALID_MOVEMENT_TYPE', 'Tipo de movimentação inválido.', 400);
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 300 then
    perform public.raise_app_error('REASON_REQUIRED', 'Informe o motivo (mínimo de 3 caracteres).', 400);
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000
     or (p_type <> 'ADJUSTMENT' and p_quantity = 0) then
    perform public.raise_app_error('INVALID_QUANTITY', 'Quantidade inválida.', 400);
  end if;

  select p.stock_available, p.name into v_available, v_name
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    perform public.raise_app_error('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 404);
  end if;

  v_delta := case p_type
    when 'IN' then p_quantity
    when 'OUT' then -p_quantity
    else p_quantity - v_available
  end;

  if v_delta = 0 then
    perform public.raise_app_error('NO_CHANGE', 'O estoque já está com esta quantidade.', 409);
  end if;

  select * into v_result
  from public._apply_stock_change(
    p_product_id, v_delta, 0, p_type, abs(v_delta), v_reason, null, null, v_actor, 'ADMIN');

  perform public.write_audit_log('inventory.' || lower(p_type::text), 'products', p_product_id::text,
    format('Estoque de %s: %s%s (%s)', v_name, case when v_delta > 0 then '+' else '' end, v_delta, v_reason),
    jsonb_build_object('type', p_type, 'delta', v_delta, 'availableAfter', v_result.available_after));

  return jsonb_build_object(
    'productId', p_product_id,
    'stockAvailable', v_result.available_after,
    'stockReserved', v_result.reserved_after
  );
end;
$$;

-- Visão de estoque para o painel (respeita RLS de quem consulta).
create view public.inventory_overview
with (security_invoker = true)
as
select
  p.id,
  p.name,
  p.slug,
  p.is_active,
  p.category_id,
  c.name as category_name,
  p.stock_available,
  p.stock_reserved,
  p.low_stock_threshold,
  case
    when p.stock_available = 0 then 'SOLD_OUT'
    when p.stock_available <= p.low_stock_threshold then 'LOW'
    else 'AVAILABLE'
  end as stock_status,
  coalesce((
    select sum(m.quantity)
    from public.inventory_movements m
    where m.product_id = p.id
      and m.type = 'OUT'
      and m.source = 'ORDER'
      and m.created_at >= now() - interval '30 days'
  ), 0)::integer as consumed_30d,
  p.updated_at
from public.products p
left join public.categories c on c.id = p.category_id;

-- -----------------------------------------------------------------------------
-- Painel: indicadores (períodos calculados em America/Sao_Paulo no servidor).
-- "Vendas" = pedidos confirmados em diante (exclui NEW, aguardando pagamento,
-- cancelados e expirados).
-- -----------------------------------------------------------------------------
create or replace function public.admin_dashboard(
  p_period text default 'today',
  p_from date default null,
  p_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from date;
  v_to date;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  perform public.require_role('OPERATOR');

  if p_period = 'today' then
    v_from := v_today; v_to := v_today;
  elsif p_period = '7d' then
    v_from := v_today - 6; v_to := v_today;
  elsif p_period = '30d' then
    v_from := v_today - 29; v_to := v_today;
  elsif p_period = 'custom' then
    if p_from is null or p_to is null or p_from > p_to or (p_to - p_from) > 366 then
      perform public.raise_app_error('INVALID_PERIOD', 'Período inválido (máximo de 1 ano).', 400);
    end if;
    v_from := p_from; v_to := p_to;
  else
    perform public.raise_app_error('INVALID_PERIOD', 'Período inválido.', 400);
  end if;

  v_start := v_from::timestamp at time zone 'America/Sao_Paulo';
  v_end := (v_to + 1)::timestamp at time zone 'America/Sao_Paulo';

  with period_orders as (
    select o.* from public.orders o
    where o.created_at >= v_start and o.created_at < v_end
  ),
  sold as (
    select * from period_orders
    where status in ('CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED')
  )
  select jsonb_build_object(
    'period', jsonb_build_object('key', p_period, 'from', v_from, 'to', v_to),
    'salesCents', coalesce((select sum(total_cents) from sold), 0),
    'soldOrders', (select count(*) from sold),
    'ordersCount', (select count(*) from period_orders),
    'canceledCount', (select count(*) from period_orders where status in ('CANCELED', 'EXPIRED')),
    'averageTicketCents', coalesce((select round(avg(total_cents))::integer from sold), 0),
    'unpaidSoldCents', coalesce((select sum(total_cents) from sold where payment_status <> 'PAID'), 0),
    'pipeline', (
      select jsonb_build_object(
        'pending', count(*) filter (where o.status in ('NEW', 'AWAITING_PAYMENT')),
        'inProduction', count(*) filter (where o.status in ('CONFIRMED', 'PREPARING')),
        'ready', count(*) filter (where o.status = 'READY'),
        'outForDelivery', count(*) filter (where o.status = 'OUT_FOR_DELIVERY'))
      from public.orders o
      where o.status in ('NEW', 'AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
    ),
    'topProducts', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productId', t.product_id,
        'name', t.name,
        'quantity', t.quantity,
        'revenueCents', t.revenue) order by t.quantity desc, t.revenue desc), '[]'::jsonb)
      from (
        select oi.product_id,
               max(oi.product_name_snapshot) as name,
               sum(oi.quantity)::integer as quantity,
               sum(oi.line_total_cents)::bigint as revenue
        from public.order_items oi
        join sold on sold.id = oi.order_id
        group by oi.product_id
        order by 3 desc, 4 desc
        limit 5
      ) t
    ),
    'lowStock', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productId', p.id,
        'name', p.name,
        'stockAvailable', p.stock_available,
        'stockReserved', p.stock_reserved,
        'lowStockThreshold', p.low_stock_threshold) order by p.stock_available, p.name), '[]'::jsonb)
      from (
        select * from public.products
        where is_active and stock_available <= low_stock_threshold
        order by stock_available, name
        limit 10
      ) p
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', d.day,
        'salesCents', coalesce(x.sales, 0),
        'orders', coalesce(x.orders, 0)) order by d.day), '[]'::jsonb)
      from (select generate_series(v_from, v_to, interval '1 day')::date as day) d
      left join (
        select (created_at at time zone 'America/Sao_Paulo')::date as day,
               sum(total_cents) as sales,
               count(*) as orders
        from sold
        group by 1
      ) x on x.day = d.day
    )
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel: clientes (dados mínimos, sem perfil detalhado).
-- -----------------------------------------------------------------------------
create or replace function public.admin_list_customers(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := nullif(regexp_replace(coalesce(p_search, ''), '\D', '', 'g'), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.require_role('ADMIN');

  with filtered as (
    select c.*
    from public.customers c
    where v_search is null
       or c.name ilike '%' || v_search || '%'
       or (v_digits is not null and c.phone like '%' || v_digits || '%')
       or c.email ilike '%' || v_search || '%'
  ),
  stats as (
    select f.id,
           count(o.id) as orders_count,
           coalesce(sum(o.total_cents) filter (
             where o.status in ('CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED')), 0) as total_spent,
           max(o.created_at) as last_order_at
    from filtered f
    left join public.orders o on o.customer_id = f.id
    group by f.id
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'items', coalesce((
      select jsonb_agg(row_data order by last_order_at desc nulls last)
      from (
        select jsonb_build_object(
          'id', f.id,
          'name', f.name,
          'phone', f.phone,
          'email', f.email,
          'ordersCount', st.orders_count,
          'totalSpentCents', st.total_spent,
          'lastOrderAt', st.last_order_at,
          'anonymized', f.anonymized_at is not null,
          'createdAt', f.created_at) as row_data,
          st.last_order_at
        from filtered f
        join stats st on st.id = f.id
        order by st.last_order_at desc nulls last, f.created_at desc
        limit v_limit offset v_offset
      ) page
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- LGPD: anonimiza um cliente a pedido do titular. Mantém os pedidos (valores e
-- itens) para fins contábeis, removendo dados pessoais.
create or replace function public.anonymize_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  c public.customers;
begin
  v_actor := public.require_role('OWNER');

  select * into c from public.customers where id = p_customer_id for update;
  if not found then
    perform public.raise_app_error('CUSTOMER_NOT_FOUND', 'Cliente não encontrado.', 404);
  end if;
  if c.anonymized_at is not null then
    return;
  end if;
  if exists (
    select 1 from public.orders o
    where o.customer_id = c.id
      and o.status in ('NEW', 'AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY')
  ) then
    perform public.raise_app_error('CUSTOMER_HAS_ACTIVE_ORDERS',
      'Conclua ou cancele os pedidos em andamento antes de anonimizar.', 409);
  end if;

  delete from public.customer_addresses where customer_id = c.id;

  update public.orders
     set customer_name = 'Cliente anonimizado',
         customer_phone = null,
         customer_email = null,
         customer_notes = null,
         delivery_address = case when delivery_address is null then null else jsonb_build_object(
           'neighborhood', delivery_address ->> 'neighborhood',
           'city', delivery_address ->> 'city',
           'state', delivery_address ->> 'state') end
   where customer_id = c.id;

  update public.customers
     set name = 'Cliente anonimizado',
         phone = null,
         email = null,
         anonymized_at = now()
   where id = c.id;

  perform public.write_audit_log('customers.anonymized', 'customers', c.id::text,
    'Dados pessoais do cliente anonimizados (LGPD)', null);
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limit (janela fixa). Usado pelas Edge Functions com a chave já em hash.
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rl.count + 1
  returning rl.count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Limpeza periódica (dados técnicos, sem valor histórico).
create or replace function public.cleanup_housekeeping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limits where window_start < now() - interval '2 days';
  delete from public.delivery_quotes
   where expires_at < now() - interval '60 days'
     and not exists (select 1 from public.orders o where o.delivery_quote_id = delivery_quotes.id);
end;
$$;
