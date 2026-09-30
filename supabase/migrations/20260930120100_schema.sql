-- =============================================================================
-- Doceria: esquema simples
-- Valores em centavos (integer). Datas de agenda em America/Sao_Paulo.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('OWNER', 'STAFF');

create type public.order_status as enum (
  'RECEIVED',          -- Recebido
  'CONFIRMED',         -- Confirmado
  'PREPARING',         -- Em preparo
  'OUT_FOR_DELIVERY',  -- Saiu para entrega
  'READY_FOR_PICKUP',  -- Pronto para retirada
  'DELIVERED',         -- Entregue / retirado
  'CANCELED'           -- Cancelado
);

create type public.payment_method as enum ('PIX', 'CASH', 'CARD');
create type public.fulfillment_type as enum ('PICKUP', 'DELIVERY');
create type public.day_period as enum ('MORNING', 'AFTERNOON', 'EVENING');

-- -----------------------------------------------------------------------------
-- Equipe: OWNER (dono/dona) e STAFF (atendente). Só entra no painel quem tem
-- profile ativo.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  role public.app_role not null default 'STAFF',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Configurações da loja (linha única)
-- -----------------------------------------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Doceria' check (char_length(store_name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 160),
  whatsapp_phone text check (whatsapp_phone is null or whatsapp_phone ~ '^\+55[1-9][0-9]{9,10}$'),
  notify_email text check (
    notify_email is null or (char_length(notify_email) <= 254 and notify_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  instagram_url text not null default '' check (char_length(instagram_url) <= 200),
  -- Site institucional (Wix): início, sobre, serviços. A loja linka de volta.
  institutional_url text not null default '' check (char_length(institutional_url) <= 200),
  accepting_orders boolean not null default true,
  pause_message text not null default '' check (char_length(pause_message) <= 300),
  -- Entrega e retirada
  delivery_enabled boolean not null default true,
  delivery_fee_cents integer not null default 500 check (delivery_fee_cents between 0 and 100000),
  delivery_city text not null default 'Cachoeiro de Itapemirim - ES' check (char_length(delivery_city) <= 80),
  pickup_enabled boolean not null default true,
  pickup_address text not null default '' check (char_length(pickup_address) <= 200),
  -- Agenda: dias da semana (0 = domingo) e períodos oferecidos
  open_weekdays smallint[] not null default '{1,2,3,4,5,6}',
  periods public.day_period[] not null default '{MORNING,AFTERNOON}',
  same_day_orders boolean not null default true,
  max_days_ahead smallint not null default 14 check (max_days_ahead between 0 and 60),
  -- Pagamento
  payment_methods public.payment_method[] not null default '{PIX,CASH,CARD}',
  pix_key text not null default '' check (char_length(pix_key) <= 120),
  pix_holder text not null default '' check (char_length(pix_holder) <= 120),
  min_order_cents integer not null default 0 check (min_order_cents between 0 and 1000000),
  -- Devolutiva
  email_customer_on_status boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint store_settings_weekdays check (
    open_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] and cardinality(open_weekdays) between 1 and 7
  ),
  constraint store_settings_periods check (cardinality(periods) between 1 and 3),
  constraint store_settings_payments check (cardinality(payment_methods) between 1 and 3),
  constraint store_settings_fulfillment check (delivery_enabled or pickup_enabled)
);

insert into public.store_settings (id) values (true);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  short_description text not null default '' check (char_length(short_description) <= 160),
  description text not null default '' check (char_length(description) <= 2000),
  price_cents integer not null check (price_cents > 0 and price_cents <= 1000000),
  image_path text check (image_path is null or char_length(image_path) between 3 and 300),
  -- Estoque opcional: null = sem controle (produção sob encomenda).
  stock integer check (stock is null or stock >= 0),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products (category_id);
create index products_active_sort_idx on public.products (is_active, sort_order, name);

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  -- Link público de acompanhamento (192 bits aleatórios).
  public_token text not null unique check (public_token ~ '^[a-f0-9]{48}$'),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 100),
  request_fingerprint text not null,
  status public.order_status not null default 'RECEIVED',
  fulfillment_type public.fulfillment_type not null,
  payment_method public.payment_method not null,
  is_paid boolean not null default false,
  paid_at timestamptz,
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text not null check (customer_phone ~ '^\+55[1-9][0-9]{9,10}$'),
  customer_email text check (
    customer_email is null or (char_length(customer_email) <= 254 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  address_street text check (address_street is null or char_length(address_street) between 2 and 120),
  address_number text check (address_number is null or char_length(address_number) between 1 and 12),
  address_district text check (address_district is null or char_length(address_district) between 2 and 80),
  address_complement text check (address_complement is null or char_length(address_complement) <= 80),
  address_reference text check (address_reference is null or char_length(address_reference) <= 160),
  scheduled_date date not null,
  scheduled_period public.day_period not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents between 0 and 100000),
  total_cents integer not null check (total_cents >= 0),
  cash_change_for_cents integer check (cash_change_for_cents is null or cash_change_for_cents > 0),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 500),
  internal_notes text not null default '' check (char_length(internal_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz,
  delivered_at timestamptz,
  constraint orders_total_check check (total_cents = subtotal_cents + delivery_fee_cents),
  constraint orders_delivery_address check (
    fulfillment_type = 'PICKUP'
    or (address_street is not null and address_number is not null and address_district is not null)
  )
);

create index orders_created_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status, scheduled_date);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price_cents integer not null check (unit_price_cents > 0),
  quantity integer not null check (quantity between 1 and 99),
  line_total_cents integer not null,
  constraint order_items_total check (line_total_cents = unit_price_cents * quantity)
);

create index order_items_order_idx on public.order_items (order_id);

-- Linha do tempo do pedido (status, pagamento, frete, anotações).
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('CREATED', 'STATUS', 'PAYMENT', 'FEE')),
  from_status public.order_status,
  to_status public.order_status,
  message text not null default '' check (char_length(message) <= 300),
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id, created_at);

-- Devolutivas enviadas (e-mail). Gravadas pelas Edge Functions.
create table public.order_notifications (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind ~ '^[A-Z_]{3,40}$'),
  channel text not null default 'EMAIL' check (channel in ('EMAIL')),
  recipient text not null check (char_length(recipient) <= 254),
  status text not null check (status in ('SENT', 'FAILED', 'SKIPPED')),
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now()
);

create index order_notifications_order_idx on public.order_notifications (order_id, created_at);

-- Limite de requisições das funções públicas (por hash de IP).
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

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
create trigger store_settings_updated_at before update on public.store_settings
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();
