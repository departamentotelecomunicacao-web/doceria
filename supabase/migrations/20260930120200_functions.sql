-- =============================================================================
-- Regras de negócio (funções). Pedidos só mudam por aqui: preço, frete e total
-- são sempre calculados no banco.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Papéis e erros
-- -----------------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_app_role() is not null
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'OWNER', false)
$$;

-- message = código estável, detail = texto em português, hint = JSON extra.
-- O SQLSTATE PTxxx vira o status HTTP no PostgREST.
create or replace function public.raise_app_error(
  p_code text,
  p_message text,
  p_http integer default 400,
  p_data jsonb default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'PT' || p_http::text,
    message = p_code,
    detail = p_message,
    hint = coalesce(p_data, '{}'::jsonb)::text;
end;
$$;

create or replace function public.require_staff()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    perform public.raise_app_error('AUTH_REQUIRED', 'Faça login para continuar.', 401);
  end if;
  if not public.is_staff() then
    perform public.raise_app_error('FORBIDDEN', 'Você não tem permissão para esta ação.', 403);
  end if;
  return auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- Agenda
-- -----------------------------------------------------------------------------
create or replace function public.store_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Datas que o cliente pode escolher (dias de funcionamento, a partir de hoje
-- ou amanhã, até max_days_ahead).
create or replace function public.available_dates()
returns date[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d::date order by d), '{}')
  from public.store_settings s,
       generate_series(
         public.store_today() + case when s.same_day_orders then 0 else 1 end,
         public.store_today() + greatest(s.max_days_ahead, case when s.same_day_orders then 0 else 1 end),
         interval '1 day'
       ) d
  where s.id
    and extract(dow from d)::smallint = any (s.open_weekdays)
$$;

-- -----------------------------------------------------------------------------
-- Configuração pública (vitrine e checkout)
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
    'whatsappPhone', s.whatsapp_phone,
    'instagramUrl', nullif(s.instagram_url, ''),
    'institutionalUrl', nullif(s.institutional_url, ''),
    'acceptingOrders', s.accepting_orders,
    'pauseMessage', nullif(s.pause_message, ''),
    'deliveryEnabled', s.delivery_enabled,
    'deliveryFeeCents', s.delivery_fee_cents,
    'deliveryCity', s.delivery_city,
    'pickupEnabled', s.pickup_enabled,
    'pickupAddress', nullif(s.pickup_address, ''),
    'periods', to_jsonb(s.periods),
    'availableDates', to_jsonb(public.available_dates()),
    'today', public.store_today(),
    'paymentMethods', to_jsonb(s.payment_methods),
    'minOrderCents', s.min_order_cents
  )
  from public.store_settings s
  where s.id
$$;

-- -----------------------------------------------------------------------------
-- Status
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
    when 'RECEIVED' then array['CONFIRMED', 'CANCELED']::public.order_status[]
    when 'CONFIRMED' then array[
      'PREPARING',
      case when p_type = 'DELIVERY' then 'OUT_FOR_DELIVERY' else 'READY_FOR_PICKUP' end,
      'CANCELED'
    ]::public.order_status[]
    when 'PREPARING' then array[
      case when p_type = 'DELIVERY' then 'OUT_FOR_DELIVERY' else 'READY_FOR_PICKUP' end,
      'CANCELED'
    ]::public.order_status[]
    when 'OUT_FOR_DELIVERY' then array['DELIVERED', 'CANCELED']::public.order_status[]
    when 'READY_FOR_PICKUP' then array['DELIVERED', 'CANCELED']::public.order_status[]
    else '{}'::public.order_status[]
  end
$$;

-- -----------------------------------------------------------------------------
-- Criação do pedido
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

create or replace function public._order_summary(p_order_id uuid, p_replayed boolean)
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
    'subtotalCents', o.subtotal_cents,
    'deliveryFeeCents', o.delivery_fee_cents,
    'totalCents', o.total_cents,
    'replayed', p_replayed
  )
  from public.orders o
  where o.id = p_order_id
$$;

-- Chamado pela Edge Function create-order (service_role). O navegador envia só
-- IDs, quantidades e dados de contato; o resto é calculado aqui, de forma
-- atômica (produtos travados em ordem estável).
create or replace function public.create_order(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.store_settings;
  v_key text := p_payload ->> 'idempotencyKey';
  v_fingerprint text;
  v_existing public.orders;
  v_type public.fulfillment_type;
  v_method public.payment_method;
  v_date date;
  v_period public.day_period;
  v_name text := btrim(coalesce(p_payload #>> '{customer,name}', ''));
  v_phone text := btrim(coalesce(p_payload #>> '{customer,phone}', ''));
  v_email text := nullif(lower(btrim(coalesce(p_payload #>> '{customer,email}', ''))), '');
  v_notes text := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  v_street text := nullif(btrim(coalesce(p_payload #>> '{fulfillment,address,street}', '')), '');
  v_number text := nullif(btrim(coalesce(p_payload #>> '{fulfillment,address,number}', '')), '');
  v_district text := nullif(btrim(coalesce(p_payload #>> '{fulfillment,address,district}', '')), '');
  v_complement text := nullif(btrim(coalesce(p_payload #>> '{fulfillment,address,complement}', '')), '');
  v_reference text := nullif(btrim(coalesce(p_payload #>> '{fulfillment,address,reference}', '')), '');
  v_cash_change integer;
  v_expected_total integer;
  v_items jsonb;
  v_item_count integer;
  v_product_ids uuid[];
  v_product record;
  v_problems jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_fee integer := 0;
  v_total bigint;
  v_order_id uuid := gen_random_uuid();
  v_code text;
begin
  -- 1. Formato ------------------------------------------------------------------
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Dados do pedido inválidos.', 400);
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{16,100}$' then
    perform public.raise_app_error('INVALID_IDEMPOTENCY_KEY', 'Identificador da solicitação inválido.', 400);
  end if;
  if jsonb_typeof(p_payload -> 'items') is distinct from 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    perform public.raise_app_error('EMPTY_CART', 'Seu carrinho está vazio.', 400);
  end if;
  if jsonb_array_length(p_payload -> 'items') > 40 then
    perform public.raise_app_error('TOO_MANY_ITEMS', 'O pedido tem itens demais.', 400);
  end if;

  begin
    v_type := (p_payload #>> '{fulfillment,type}')::public.fulfillment_type;
    v_method := (p_payload ->> 'paymentMethod')::public.payment_method;
    v_date := (p_payload #>> '{fulfillment,date}')::date;
    v_period := (p_payload #>> '{fulfillment,period}')::public.day_period;
    v_cash_change := nullif(p_payload ->> 'cashChangeForCents', '')::integer;
    v_expected_total := nullif(p_payload ->> 'expectedTotalCents', '')::integer;

    if exists (
      select 1
      from jsonb_array_elements(p_payload -> 'items') e
      where jsonb_typeof(e) <> 'object'
         or (e ->> 'productId') is null
         or jsonb_typeof(e -> 'quantity') <> 'number'
         or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
         or (e ->> 'quantity')::integer < 1
         or (e ->> 'quantity')::integer > 99
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

  if v_type is null or v_method is null or v_date is null or v_period is null then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Escolha entrega ou retirada, data, período e pagamento.', 400);
  end if;
  if exists (select 1 from jsonb_to_recordset(v_items) as i(quantity integer) where i.quantity > 99) then
    perform public.raise_app_error('INVALID_QUANTITY', 'Quantidade inválida.', 400);
  end if;
  if char_length(v_name) not between 2 and 120 then
    perform public.raise_app_error('INVALID_CUSTOMER', 'Informe seu nome.', 400, jsonb_build_object('field', 'name'));
  end if;
  if v_phone !~ '^\+55[1-9][0-9]{9,10}$' then
    perform public.raise_app_error('INVALID_CUSTOMER', 'WhatsApp inválido.', 400, jsonb_build_object('field', 'phone'));
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    perform public.raise_app_error('INVALID_CUSTOMER', 'E-mail inválido.', 400, jsonb_build_object('field', 'email'));
  end if;
  if v_notes is not null and char_length(v_notes) > 500 then
    perform public.raise_app_error('INVALID_PAYLOAD', 'Observação muito longa.', 400, jsonb_build_object('field', 'notes'));
  end if;

  if v_type = 'DELIVERY' then
    if v_street is null or char_length(v_street) not between 2 and 120
       or v_number is null or char_length(v_number) > 12
       or v_district is null or char_length(v_district) not between 2 and 80
       or char_length(coalesce(v_complement, '')) > 80
       or char_length(coalesce(v_reference, '')) > 160 then
      perform public.raise_app_error('INVALID_ADDRESS', 'Confira o endereço de entrega.', 400,
        jsonb_build_object('field', 'address'));
    end if;
  else
    v_street := null; v_number := null; v_district := null; v_complement := null; v_reference := null;
  end if;

  -- 2. Idempotência (duplo clique, reenvio após timeout) ------------------------
  v_fingerprint := md5(jsonb_build_object(
    'name', v_name, 'phone', v_phone, 'email', v_email, 'type', v_type,
    'date', v_date, 'period', v_period, 'street', v_street, 'number', v_number,
    'district', v_district, 'method', v_method, 'cashChange', v_cash_change,
    'notes', v_notes, 'items', v_items
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

  -- 3. Regras da loja -----------------------------------------------------------
  select * into s from public.store_settings where id;

  if not s.accepting_orders then
    perform public.raise_app_error('STORE_PAUSED',
      coalesce(nullif(s.pause_message, ''), 'No momento não estamos recebendo pedidos.'), 409);
  end if;
  if v_type = 'PICKUP' and not s.pickup_enabled then
    perform public.raise_app_error('PICKUP_UNAVAILABLE', 'Retirada indisponível no momento.', 409);
  end if;
  if v_type = 'DELIVERY' and not s.delivery_enabled then
    perform public.raise_app_error('DELIVERY_UNAVAILABLE', 'Entrega indisponível no momento.', 409);
  end if;
  if not (v_method = any (s.payment_methods)) then
    perform public.raise_app_error('PAYMENT_METHOD_UNAVAILABLE', 'Forma de pagamento indisponível.', 409);
  end if;
  if not (v_date = any (public.available_dates())) or not (v_period = any (s.periods)) then
    perform public.raise_app_error('DATE_UNAVAILABLE', 'Escolha outra data ou período.', 409);
  end if;

  -- 4. Produtos e estoque (trava em ordem estável) -----------------------------
  perform 1 from public.products p where p.id = any (v_product_ids) order by p.id for update;

  for v_product in
    select i."productId" as product_id, i.quantity, p.id as found_id, p.name, p.price_cents,
           p.stock, p.is_active
    from jsonb_to_recordset(v_items) as i("productId" uuid, quantity integer)
    left join public.products p on p.id = i."productId"
    order by i."productId"
  loop
    if v_product.found_id is null or not v_product.is_active then
      v_problems := v_problems || jsonb_build_object(
        'productId', v_product.product_id, 'code', 'PRODUCT_UNAVAILABLE', 'name', v_product.name);
    elsif v_product.stock is not null and v_product.quantity > v_product.stock then
      v_problems := v_problems || jsonb_build_object(
        'productId', v_product.product_id, 'code', 'OUT_OF_STOCK', 'name', v_product.name,
        'available', v_product.stock, 'requested', v_product.quantity);
    else
      v_subtotal := v_subtotal + v_product.price_cents::bigint * v_product.quantity;
    end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then
    if v_problems @> '[{"code":"PRODUCT_UNAVAILABLE"}]' then
      perform public.raise_app_error('PRODUCT_UNAVAILABLE',
        'Um ou mais produtos não estão mais disponíveis.', 409, jsonb_build_object('problems', v_problems));
    else
      perform public.raise_app_error('OUT_OF_STOCK',
        'Não há quantidade suficiente de um ou mais produtos.', 409, jsonb_build_object('problems', v_problems));
    end if;
  end if;

  if v_subtotal < s.min_order_cents then
    perform public.raise_app_error('BELOW_MINIMUM_ORDER', 'O pedido não atingiu o valor mínimo.', 409,
      jsonb_build_object('minOrderCents', s.min_order_cents, 'subtotalCents', v_subtotal));
  end if;

  -- 5. Frete fixo e total ---------------------------------------------------------
  v_fee := case when v_type = 'DELIVERY' then s.delivery_fee_cents else 0 end;
  v_total := v_subtotal + v_fee;

  -- Nunca cobrar valor diferente do que o cliente viu.
  if v_expected_total is null or v_expected_total <> v_total then
    perform public.raise_app_error('PRICE_CHANGED',
      'Os valores foram atualizados. Confira o novo total antes de confirmar.', 409,
      jsonb_build_object(
        'subtotalCents', v_subtotal,
        'deliveryFeeCents', v_fee,
        'totalCents', v_total,
        'items', (
          select jsonb_agg(jsonb_build_object('productId', p.id, 'unitPriceCents', p.price_cents))
          from public.products p where p.id = any (v_product_ids)
        )));
  end if;

  if v_method <> 'CASH' then
    v_cash_change := null;
  elsif v_cash_change is not null and v_cash_change < v_total then
    perform public.raise_app_error('INVALID_CASH_CHANGE', 'O valor para troco deve ser maior que o total.', 400);
  end if;

  -- 6. Grava ----------------------------------------------------------------------
  v_code := public._generate_order_code();

  insert into public.orders (
    id, code, public_token, idempotency_key, request_fingerprint, status, fulfillment_type,
    payment_method, customer_name, customer_phone, customer_email, address_street,
    address_number, address_district, address_complement, address_reference,
    scheduled_date, scheduled_period, subtotal_cents, delivery_fee_cents, total_cents,
    cash_change_for_cents, customer_notes
  ) values (
    v_order_id, v_code, encode(extensions.gen_random_bytes(24), 'hex'), v_key, v_fingerprint,
    'RECEIVED', v_type, v_method, v_name, v_phone, v_email, v_street, v_number, v_district,
    v_complement, v_reference, v_date, v_period, v_subtotal::integer, v_fee, v_total::integer,
    v_cash_change, v_notes
  );

  for v_product in
    select i."productId" as product_id, i.quantity, p.name, p.price_cents, p.stock
    from jsonb_to_recordset(v_items) as i("productId" uuid, quantity integer)
    join public.products p on p.id = i."productId"
    order by i."productId"
  loop
    insert into public.order_items (order_id, product_id, product_name, unit_price_cents, quantity, line_total_cents)
    values (v_order_id, v_product.product_id, v_product.name, v_product.price_cents,
            v_product.quantity, v_product.price_cents * v_product.quantity);

    if v_product.stock is not null then
      update public.products set stock = stock - v_product.quantity where id = v_product.product_id;
    end if;
  end loop;

  insert into public.order_events (order_id, kind, to_status, message)
  values (v_order_id, 'CREATED', 'RECEIVED', 'Pedido feito pelo site');

  return public._order_summary(v_order_id, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Página pública do pedido (acesso pelo token secreto do link)
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
begin
  if p_token is null or p_token !~ '^[a-f0-9]{48}$' then
    return null;
  end if;

  select * into o from public.orders where public_token = p_token;
  if not found then
    return null;
  end if;
  select * into s from public.store_settings where id;

  return jsonb_build_object(
    'code', o.code,
    'status', o.status,
    'fulfillmentType', o.fulfillment_type,
    'customerFirstName', split_part(o.customer_name, ' ', 1),
    'district', o.address_district,
    'scheduledDate', o.scheduled_date,
    'scheduledPeriod', o.scheduled_period,
    'paymentMethod', o.payment_method,
    'isPaid', o.is_paid,
    'cashChangeForCents', o.cash_change_for_cents,
    'subtotalCents', o.subtotal_cents,
    'deliveryFeeCents', o.delivery_fee_cents,
    'totalCents', o.total_cents,
    'createdAt', o.created_at,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', i.product_name,
        'quantity', i.quantity,
        'unitPriceCents', i.unit_price_cents,
        'lineTotalCents', i.line_total_cents
      ) order by i.product_name), '[]'::jsonb)
      from public.order_items i where i.order_id = o.id
    ),
    'timeline', (
      select coalesce(jsonb_agg(jsonb_build_object('status', e.to_status, 'at', e.created_at) order by e.created_at, e.id), '[]'::jsonb)
      from public.order_events e
      where e.order_id = o.id and e.to_status is not null
    ),
    'pix', case
      when o.payment_method = 'PIX' and not o.is_paid and o.status <> 'CANCELED' and s.pix_key <> ''
      then jsonb_build_object('key', s.pix_key, 'holder', nullif(s.pix_holder, ''))
    end,
    'pickupAddress', case when o.fulfillment_type = 'PICKUP' then nullif(s.pickup_address, '') end,
    'emailSent', exists (
      select 1 from public.order_notifications n
      where n.order_id = o.id and n.kind = 'ORDER_RECEIVED' and n.status = 'SENT'
    ),
    'store', jsonb_build_object('name', s.store_name, 'whatsappPhone', s.whatsapp_phone)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Painel: ações sobre o pedido (qualquer pessoa da equipe)
-- -----------------------------------------------------------------------------
create or replace function public.admin_set_status(
  p_order_id uuid,
  p_status public.order_status,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_staff();
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
  if o.status = p_status then
    return jsonb_build_object('status', o.status, 'changed', false);
  end if;
  if not (p_status = any (public.order_next_statuses(o.status, o.fulfillment_type))) then
    perform public.raise_app_error('INVALID_TRANSITION', 'Esta mudança de status não é permitida.', 409,
      jsonb_build_object('from', o.status, 'to', p_status));
  end if;

  if p_status = 'CANCELED' then
    -- Devolve ao estoque o que foi vendido (produtos com controle de estoque).
    update public.products p
       set stock = p.stock + i.quantity
      from public.order_items i
     where i.order_id = o.id and i.product_id = p.id and p.stock is not null;
  end if;

  update public.orders
     set status = p_status,
         canceled_at = case when p_status = 'CANCELED' then now() else canceled_at end,
         delivered_at = case when p_status = 'DELIVERED' then now() else delivered_at end
   where id = o.id;

  insert into public.order_events (order_id, kind, from_status, to_status, message, actor_id)
  values (o.id, 'STATUS', o.status, p_status, left(coalesce(btrim(p_message), ''), 300), v_actor);

  return jsonb_build_object('status', p_status, 'changed', true);
end;
$$;

create or replace function public.admin_set_paid(p_order_id uuid, p_paid boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_staff();
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
  if o.is_paid = p_paid then
    return;
  end if;

  update public.orders
     set is_paid = p_paid, paid_at = case when p_paid then now() end
   where id = o.id;

  insert into public.order_events (order_id, kind, message, actor_id)
  values (o.id, 'PAYMENT', case when p_paid then 'Pagamento recebido' else 'Pagamento desmarcado' end, v_actor);
end;
$$;

create or replace function public.admin_set_delivery_fee(p_order_id uuid, p_fee_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_staff();
  o public.orders;
begin
  if p_fee_cents is null or p_fee_cents < 0 or p_fee_cents > 100000 then
    perform public.raise_app_error('INVALID_DELIVERY_FEE', 'Taxa de entrega inválida.', 400);
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
  if o.fulfillment_type <> 'DELIVERY' then
    perform public.raise_app_error('NOT_DELIVERY', 'Pedido de retirada não tem taxa de entrega.', 409);
  end if;
  if o.status in ('DELIVERED', 'CANCELED') then
    perform public.raise_app_error('ORDER_CLOSED', 'Pedido já finalizado.', 409);
  end if;
  if o.delivery_fee_cents = p_fee_cents then
    return jsonb_build_object('totalCents', o.total_cents);
  end if;

  update public.orders
     set delivery_fee_cents = p_fee_cents, total_cents = subtotal_cents + p_fee_cents
   where id = o.id;

  insert into public.order_events (order_id, kind, message, actor_id)
  values (o.id, 'FEE', format('Taxa de entrega: %s → %s centavos', o.delivery_fee_cents, p_fee_cents), v_actor);

  return jsonb_build_object('totalCents', o.subtotal_cents + p_fee_cents);
end;
$$;

create or replace function public.admin_set_internal_notes(p_order_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  if char_length(coalesce(p_notes, '')) > 2000 then
    perform public.raise_app_error('INVALID_NOTES', 'Anotação muito longa.', 400);
  end if;
  update public.orders set internal_notes = coalesce(p_notes, '') where id = p_order_id;
  if not found then
    perform public.raise_app_error('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
  end if;
end;
$$;

-- Atendente pode marcar produto como disponível/esgotado e ajustar a
-- quantidade; preço, nome e foto ficam com o dono (RLS).
create or replace function public.admin_set_product_stock(
  p_product_id uuid,
  p_is_active boolean,
  p_stock integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  if p_is_active is null or (p_stock is not null and (p_stock < 0 or p_stock > 100000)) then
    perform public.raise_app_error('INVALID_STOCK', 'Quantidade inválida.', 400);
  end if;
  update public.products set is_active = p_is_active, stock = p_stock where id = p_product_id;
  if not found then
    perform public.raise_app_error('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 404);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Rate limit das funções públicas (service_role)
-- -----------------------------------------------------------------------------
create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$$;
