-- =============================================================================
-- Funções auxiliares: papéis, erros de negócio, updated_at, auditoria e
-- proteção do estoque contra alteração direta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Papéis
-- -----------------------------------------------------------------------------
create or replace function public.role_rank(p_role public.app_role)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'OWNER' then 3
    when 'ADMIN' then 2
    when 'OPERATOR' then 1
    else 0
  end
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
$$;

create or replace function public.has_min_role(p_min_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.role_rank(public.current_app_role()) >= public.role_rank(p_min_role),
    false
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_min_role('OPERATOR')
$$;

-- -----------------------------------------------------------------------------
-- Erros de negócio padronizados.
-- message = código estável (ex.: OUT_OF_STOCK), detail = texto em português,
-- hint = JSON com dados adicionais. SQLSTATE PTxxx define o HTTP no PostgREST.
-- -----------------------------------------------------------------------------
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

create or replace function public.require_role(p_min_role public.app_role)
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
  if not public.has_min_role(p_min_role) then
    perform public.raise_app_error('FORBIDDEN', 'Você não tem permissão para esta ação.', 403);
  end if;
  return auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
create trigger delivery_rules_updated_at before update on public.delivery_rules
  for each row execute function public.set_updated_at();
create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_summary text,
  p_changes jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary, changes)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, left(coalesce(p_summary, ''), 500), p_changes);
end;
$$;

-- Diferença entre duas linhas (apenas colunas alteradas), ignorando colunas
-- técnicas ou já rastreadas em outro lugar.
create or replace function public.jsonb_row_diff(p_old jsonb, p_new jsonb, p_ignore text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(n.key, jsonb_build_object('from', p_old -> n.key, 'to', n.value)),
    '{}'::jsonb
  )
  from jsonb_each(p_new) n
  where not (n.key = any (p_ignore))
    and (p_old -> n.key) is distinct from n.value
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignore text[] := array['updated_at', 'created_at', 'stock_available', 'stock_reserved', 'updated_by'];
  v_changes jsonb;
  v_entity_id text;
  v_label text;
begin
  if tg_op = 'INSERT' then
    v_entity_id := (to_jsonb(new) ->> 'id');
    v_label := coalesce(to_jsonb(new) ->> 'name', v_entity_id);
    perform public.write_audit_log(
      tg_table_name || '.created', tg_table_name, v_entity_id,
      'Criado: ' || v_label, null
    );
    return new;
  elsif tg_op = 'DELETE' then
    v_entity_id := (to_jsonb(old) ->> 'id');
    v_label := coalesce(to_jsonb(old) ->> 'name', v_entity_id);
    perform public.write_audit_log(
      tg_table_name || '.deleted', tg_table_name, v_entity_id,
      'Removido: ' || v_label, null
    );
    return old;
  end if;

  v_entity_id := (to_jsonb(new) ->> 'id');
  v_changes := public.jsonb_row_diff(to_jsonb(old), to_jsonb(new), v_ignore);
  if v_changes = '{}'::jsonb then
    return new;
  end if;

  v_label := coalesce(to_jsonb(new) ->> 'name', to_jsonb(new) ->> 'store_name', v_entity_id);

  if tg_table_name = 'products' and v_changes ? 'price_cents' then
    perform public.write_audit_log(
      'products.price_changed', 'products', v_entity_id,
      format(
        'Preço de %s alterado de %s para %s centavos',
        v_label, old.price_cents, new.price_cents
      ),
      jsonb_build_object('price_cents', v_changes -> 'price_cents')
    );
    v_changes := v_changes - 'price_cents';
    if v_changes = '{}'::jsonb then
      return new;
    end if;
  end if;

  perform public.write_audit_log(
    tg_table_name || '.updated', tg_table_name, v_entity_id,
    'Alterado: ' || v_label, v_changes
  );
  return new;
end;
$$;

create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_row_change();
create trigger categories_audit after insert or update or delete on public.categories
  for each row execute function public.audit_row_change();
create trigger delivery_rules_audit after insert or update or delete on public.delivery_rules
  for each row execute function public.audit_row_change();
create trigger store_settings_audit after update on public.store_settings
  for each row execute function public.audit_row_change();
-- Alterações na equipe são auditadas pela Edge Function admin-users (com o
-- autor da mudança), por isso profiles não usa o gatilho genérico.

-- store_settings.updated_by
create or replace function public.store_settings_set_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger store_settings_actor before update on public.store_settings
  for each row execute function public.store_settings_set_actor();

-- -----------------------------------------------------------------------------
-- Validação de horários: {"1": [["09:00","12:00"],["14:00","18:00"]], ...}
-- -----------------------------------------------------------------------------
create or replace function public.is_valid_weekly_hours(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day text;
  v_windows jsonb;
  v_window jsonb;
begin
  if jsonb_typeof(p_hours) <> 'object' then
    return false;
  end if;
  for v_day, v_windows in select key, value from jsonb_each(p_hours) loop
    if v_day not in ('1', '2', '3', '4', '5', '6', '7') or jsonb_typeof(v_windows) <> 'array' then
      return false;
    end if;
    if jsonb_array_length(v_windows) > 4 then
      return false;
    end if;
    for v_window in select value from jsonb_array_elements(v_windows) loop
      if jsonb_typeof(v_window) <> 'array' or jsonb_array_length(v_window) <> 2 then
        return false;
      end if;
      if (v_window ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (v_window ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$' then
        return false;
      end if;
      if (v_window ->> 0)::time >= (case when v_window ->> 1 = '24:00' then '23:59:59' else v_window ->> 1 end)::time then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

alter table public.store_settings
  add constraint store_settings_business_hours_valid check (public.is_valid_weekly_hours(business_hours)),
  add constraint store_settings_delivery_hours_valid check (public.is_valid_weekly_hours(delivery_hours)),
  add constraint store_settings_content_object check (jsonb_typeof(content) = 'object');

-- -----------------------------------------------------------------------------
-- Estoque: só pode mudar através de public._apply_stock_change (que registra
-- o movimento). Qualquer UPDATE direto nas colunas de estoque é rejeitado.
-- -----------------------------------------------------------------------------
create or replace function public.products_guard_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.stock_reserved <> 0 then
      raise exception using errcode = 'PT400', message = 'STOCK_DIRECT_UPDATE_FORBIDDEN',
        detail = 'Um produto novo não pode nascer com estoque reservado.';
    end if;
    return new;
  end if;

  if (new.stock_available is distinct from old.stock_available
      or new.stock_reserved is distinct from old.stock_reserved)
    and coalesce(current_setting('app.inventory_op', true), '') <> 'on' then
    raise exception using errcode = 'PT400', message = 'STOCK_DIRECT_UPDATE_FORBIDDEN',
      detail = 'Use entrada, saída ou ajuste de estoque (com motivo) para alterar quantidades.';
  end if;
  return new;
end;
$$;

create trigger products_guard_stock before insert or update on public.products
  for each row execute function public.products_guard_stock();

-- Estoque inicial informado na criação do produto vira movimento IN.
create or replace function public.products_initial_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_available > 0 then
    insert into public.inventory_movements (
      product_id, type, quantity, available_delta, reserved_delta,
      available_after, reserved_after, reason, actor_id, source
    ) values (
      new.id, 'IN', new.stock_available, new.stock_available, 0,
      new.stock_available, 0, 'Estoque inicial', auth.uid(),
      case when auth.uid() is null then 'SYSTEM' else 'ADMIN' end
    );
  end if;
  return new;
end;
$$;

create trigger products_initial_stock after insert on public.products
  for each row execute function public.products_initial_stock_movement();

-- Aplica uma variação de estoque de forma atômica e registra o movimento.
-- Deve ser chamada com a linha do produto já bloqueada (FOR UPDATE) quando
-- houver verificação prévia de disponibilidade.
create or replace function public._apply_stock_change(
  p_product_id uuid,
  p_available_delta integer,
  p_reserved_delta integer,
  p_type public.inventory_movement_type,
  p_quantity integer,
  p_reason text,
  p_order_id uuid,
  p_reservation_id uuid,
  p_actor_id uuid,
  p_source text
)
returns table (available_after integer, reserved_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available integer;
  v_reserved integer;
begin
  select p.stock_available, p.stock_reserved
    into v_available, v_reserved
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    perform public.raise_app_error('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 404);
  end if;

  if v_available + p_available_delta < 0 or v_reserved + p_reserved_delta < 0 then
    perform public.raise_app_error(
      'INSUFFICIENT_STOCK',
      'Estoque insuficiente para esta operação.',
      409,
      jsonb_build_object(
        'productId', p_product_id,
        'available', v_available,
        'reserved', v_reserved,
        'availableDelta', p_available_delta,
        'reservedDelta', p_reserved_delta
      )
    );
  end if;

  perform set_config('app.inventory_op', 'on', true);
  update public.products
     set stock_available = stock_available + p_available_delta,
         stock_reserved = stock_reserved + p_reserved_delta
   where id = p_product_id
  returning stock_available, stock_reserved into v_available, v_reserved;
  perform set_config('app.inventory_op', 'off', true);

  insert into public.inventory_movements (
    product_id, type, quantity, available_delta, reserved_delta,
    available_after, reserved_after, reason, order_id, reservation_id, actor_id, source
  ) values (
    p_product_id, p_type, p_quantity, p_available_delta, p_reserved_delta,
    v_available, v_reserved, p_reason, p_order_id, p_reservation_id, p_actor_id, p_source
  );

  available_after := v_available;
  reserved_after := v_reserved;
  return next;
end;
$$;
