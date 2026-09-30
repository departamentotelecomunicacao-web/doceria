-- =============================================================================
-- Doceria: esquema principal
-- Valores monetários sempre em centavos (integer). Datas em timestamptz (UTC no
-- banco, apresentação em America/Sao_Paulo).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.app_role as enum ('OWNER', 'ADMIN', 'OPERATOR');

create type public.order_status as enum (
  'NEW',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELED',
  'EXPIRED'
);

create type public.payment_status as enum (
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'MANUAL_CONFIRMATION'
);

-- PIX manual, dinheiro e cartão na entrega/retirada (MVP).
create type public.payment_method as enum ('PIX', 'CASH', 'CARD');

create type public.fulfillment_type as enum ('PICKUP', 'DELIVERY');

create type public.inventory_movement_type as enum (
  'IN',
  'OUT',
  'RESERVATION',
  'RELEASE',
  'ADJUSTMENT'
);

create type public.reservation_status as enum ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');

create type public.delivery_pricing_mode as enum ('DISTANCE_TABLE', 'BASE_PLUS_PER_KM');

create type public.order_source as enum ('STOREFRONT', 'ADMIN');

-- -----------------------------------------------------------------------------
-- Equipe (papéis: OWNER, ADMIN, OPERATOR). Um usuário do Auth só tem acesso
-- administrativo se existir um profile ativo para ele.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  role public.app_role not null default 'OPERATOR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Membros da equipe com acesso ao painel. Clientes não possuem login.';

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 70),
  description text not null default '' check (char_length(description) <= 300),
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
  description text not null default '' check (char_length(description) <= 4000),
  price_cents integer not null check (price_cents > 0 and price_cents <= 10000000),
  compare_at_price_cents integer check (
    compare_at_price_cents is null or compare_at_price_cents > price_cents
  ),
  -- Estoque de unidades prontas para venda (não há controle de ingredientes).
  stock_available integer not null default 0 check (stock_available >= 0),
  stock_reserved integer not null default 0 check (stock_reserved >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  max_per_order integer not null default 24 check (max_per_order between 1 and 500),
  is_active boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  allergens text[] not null default '{}',
  ingredients text not null default '' check (char_length(ingredients) <= 2000),
  weight_grams integer check (weight_grams is null or weight_grams between 1 and 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_category_idx on public.products (category_id);
create index products_active_sort_idx on public.products (is_active, sort_order, name);

-- Imagens ficam no Supabase Storage; o banco guarda apenas o caminho.
create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 3 and 300),
  thumb_path text check (thumb_path is null or char_length(thumb_path) between 3 and 300),
  alt_text text not null default '' check (char_length(alt_text) <= 200),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  is_main boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_main_idx on public.product_images (product_id) where is_main;

-- -----------------------------------------------------------------------------
-- Clientes (sem login). Identificados pelo telefone normalizado em E.164.
-- -----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text unique check (phone is null or phone ~ '^\+55[1-9][0-9]{9,10}$'),
  email text check (
    email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_phone_required check (phone is not null or anonymized_at is not null)
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  cep text not null check (cep ~ '^[0-9]{8}$'),
  street text not null check (char_length(street) between 2 and 120),
  number text not null check (char_length(number) between 1 and 12),
  complement text check (complement is null or char_length(complement) <= 80),
  neighborhood text not null check (char_length(neighborhood) between 2 and 80),
  city text not null check (char_length(city) between 2 and 80),
  state text not null check (state ~ '^[A-Z]{2}$'),
  reference text check (reference is null or char_length(reference) <= 160),
  destination_hash text not null,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (customer_id, destination_hash)
);

-- -----------------------------------------------------------------------------
-- Entrega
-- -----------------------------------------------------------------------------
-- Faixas de distância (modo DISTANCE_TABLE). Faixa (min, max], em metros.
create table public.delivery_rules (
  id uuid primary key default gen_random_uuid(),
  min_distance_m integer not null check (min_distance_m >= 0),
  max_distance_m integer not null,
  fee_cents integer not null check (fee_cents between 0 and 100000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_rules_range_check check (
    max_distance_m > min_distance_m and max_distance_m <= 200000
  ),
  constraint delivery_rules_no_overlap exclude using gist (
    int4range(min_distance_m, max_distance_m, '(]') with &&
  ) where (is_active)
);

-- Cache/auditoria das consultas ao provedor de rotas. Não guarda o endereço
-- completo (dado pessoal): apenas hash do destino, bairro e cidade.
create table public.delivery_quotes (
  id uuid primary key default gen_random_uuid(),
  origin_hash text not null,
  destination_hash text not null,
  neighborhood text,
  city text,
  provider text not null,
  status text not null check (
    status in ('OK', 'NOT_FOUND', 'IMPRECISE_ADDRESS', 'PROVIDER_ERROR')
  ),
  distance_meters integer check (distance_meters is null or distance_meters >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  fee_cents integer check (fee_cents is null or fee_cents >= 0),
  available boolean,
  unavailable_reason text,
  requester_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint delivery_quotes_ok_has_distance check (status <> 'OK' or distance_meters is not null)
);

create index delivery_quotes_lookup_idx
  on public.delivery_quotes (origin_hash, destination_hash, created_at desc);
create index delivery_quotes_expires_idx on public.delivery_quotes (expires_at);

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  -- Código curto e não sequencial exibido ao cliente/WhatsApp (ex.: K7Q3MA).
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  -- Segredo usado na URL /pedido/:publicToken. Nunca sequencial.
  public_token text not null unique check (public_token ~ '^[a-f0-9]{48}$'),
  idempotency_key text unique check (
    idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,100}$'
  ),
  request_fingerprint text,
  source public.order_source not null default 'STOREFRONT',
  status public.order_status not null,
  payment_status public.payment_status not null default 'PENDING',
  payment_method public.payment_method not null,
  fulfillment_type public.fulfillment_type not null,
  customer_id uuid references public.customers (id) on delete restrict,
  -- Snapshots: o histórico não depende de dados mutáveis do cliente.
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text,
  customer_email text,
  delivery_address jsonb,
  delivery_destination_hash text,
  delivery_quote_id uuid references public.delivery_quotes (id) on delete set null,
  delivery_distance_meters integer check (delivery_distance_meters is null or delivery_distance_meters >= 0),
  delivery_duration_seconds integer check (delivery_duration_seconds is null or delivery_duration_seconds >= 0),
  delivery_fee_is_manual boolean not null default false,
  scheduled_for timestamptz not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  delivery_fee_cents integer not null default 0 check (delivery_fee_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  cash_change_for_cents integer check (cash_change_for_cents is null or cash_change_for_cents > 0),
  customer_notes text check (customer_notes is null or char_length(customer_notes) <= 500),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 2000),
  expires_at timestamptz,
  confirmed_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_total_consistent check (
    total_cents = subtotal_cents + delivery_fee_cents - discount_cents
  ),
  constraint orders_delivery_address_required check (
    fulfillment_type = 'PICKUP' or delivery_address is not null
  )
);

create index orders_created_idx on public.orders (created_at desc);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_scheduled_idx on public.orders (scheduled_for);
create index orders_pending_expiry_idx on public.orders (expires_at)
  where status in ('NEW', 'AWAITING_PAYMENT');

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete restrict,
  product_name_snapshot text not null,
  unit_price_cents_snapshot integer not null check (unit_price_cents_snapshot >= 0),
  quantity integer not null check (quantity between 1 and 500),
  line_total_cents integer not null,
  created_at timestamptz not null default now(),
  constraint order_items_line_total check (line_total_cents = unit_price_cents_snapshot * quantity),
  unique (order_id, product_id)
);

create index order_items_product_idx on public.order_items (product_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('CUSTOMER', 'ADMIN', 'SYSTEM', 'PAYMENT')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- Livro-razão de pagamentos: cada evento gera uma linha. orders.payment_status
-- guarda o estado atual.
create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider text not null default 'MANUAL' check (char_length(provider) <= 40),
  method public.payment_method not null,
  status public.payment_status not null,
  amount_cents integer not null check (amount_cents >= 0),
  external_id text check (external_id is null or char_length(external_id) <= 200),
  actor_id uuid references auth.users (id) on delete set null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index payment_records_order_idx on public.payment_records (order_id, created_at);
create unique index payment_records_external_idx on public.payment_records (provider, external_id, status)
  where external_id is not null;

-- -----------------------------------------------------------------------------
-- Estoque
-- -----------------------------------------------------------------------------
create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.reservation_status not null default 'ACTIVE',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (order_id, product_id)
);

create index inventory_reservations_active_idx on public.inventory_reservations (expires_at)
  where status = 'ACTIVE';
create index inventory_reservations_product_idx on public.inventory_reservations (product_id)
  where status = 'ACTIVE';

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete restrict,
  type public.inventory_movement_type not null,
  quantity integer not null check (quantity > 0),
  available_delta integer not null,
  reserved_delta integer not null,
  available_after integer not null check (available_after >= 0),
  reserved_after integer not null check (reserved_after >= 0),
  reason text not null check (char_length(reason) between 3 and 300),
  order_id uuid references public.orders (id) on delete set null,
  reservation_id uuid references public.inventory_reservations (id) on delete set null,
  actor_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('ADMIN', 'ORDER', 'SYSTEM')),
  created_at timestamptz not null default now()
);

create index inventory_movements_product_idx on public.inventory_movements (product_id, created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id);

-- -----------------------------------------------------------------------------
-- Configurações da loja (linha única). Campos privados (endereço de produção,
-- coordenadas) só são lidos pela equipe; o público recebe um recorte via RPC.
-- -----------------------------------------------------------------------------
create table public.store_settings (
  id boolean primary key default true check (id),
  store_name text not null default 'Minha Doceria' check (char_length(store_name) between 2 and 80),
  tagline text not null default '' check (char_length(tagline) <= 160),
  legal_name text not null default '' check (char_length(legal_name) <= 160),
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^[1-9][0-9]{11,12}$'),
  instagram_handle text check (
    instagram_handle is null or instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'
  ),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  privacy_contact_email text check (
    privacy_contact_email is null or char_length(privacy_contact_email) <= 254
  ),
  wix_site_url text check (wix_site_url is null or wix_site_url ~ '^https?://'),
  public_location_label text not null default 'Cachoeiro de Itapemirim - ES'
    check (char_length(public_location_label) <= 120),
  -- Privado: revelado somente na página do pedido de retirada.
  pickup_address text not null default '' check (char_length(pickup_address) <= 300),
  pickup_instructions text not null default '' check (char_length(pickup_instructions) <= 500),
  -- Privado: origem usada no cálculo de rota.
  origin_address text not null default '' check (char_length(origin_address) <= 300),
  origin_lat numeric(9, 6) check (origin_lat is null or origin_lat between -90 and 90),
  origin_lng numeric(9, 6) check (origin_lng is null or origin_lng between -180 and 180),
  accepting_orders boolean not null default true,
  pause_message text not null default '' check (char_length(pause_message) <= 300),
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  -- {"1": [["09:00","18:00"]], ..., "7": []} (1 = segunda ... 7 = domingo, ISO)
  business_hours jsonb not null default '{"1":[["10:00","18:00"]],"2":[["10:00","18:00"]],"3":[["10:00","18:00"]],"4":[["10:00","18:00"]],"5":[["10:00","18:00"]],"6":[["10:00","14:00"]],"7":[]}',
  delivery_hours jsonb not null default '{"1":[["14:00","19:00"]],"2":[["14:00","19:00"]],"3":[["14:00","19:00"]],"4":[["14:00","19:00"]],"5":[["14:00","19:00"]],"6":[["10:00","14:00"]],"7":[]}',
  slot_interval_minutes integer not null default 60 check (slot_interval_minutes between 15 and 240),
  min_lead_time_minutes integer not null default 60 check (min_lead_time_minutes between 0 and 10080),
  max_days_ahead integer not null default 7 check (max_days_ahead between 0 and 30),
  min_order_cents integer not null default 0 check (min_order_cents >= 0),
  free_delivery_min_subtotal_cents integer check (
    free_delivery_min_subtotal_cents is null or free_delivery_min_subtotal_cents > 0
  ),
  delivery_pricing_mode public.delivery_pricing_mode not null default 'DISTANCE_TABLE',
  delivery_base_fee_cents integer not null default 500 check (delivery_base_fee_cents between 0 and 100000),
  delivery_per_km_cents integer not null default 150 check (delivery_per_km_cents between 0 and 100000),
  delivery_max_distance_m integer not null default 12000 check (
    delivery_max_distance_m between 100 and 200000
  ),
  -- Prazo para a loja aceitar pedidos NEW (dinheiro/cartão) e para o cliente
  -- pagar pedidos AWAITING_PAYMENT (PIX). Vencido o prazo, a reserva expira.
  new_order_ttl_minutes integer not null default 720 check (new_order_ttl_minutes between 15 and 4320),
  payment_ttl_minutes integer not null default 60 check (payment_ttl_minutes between 10 and 1440),
  payment_methods public.payment_method[] not null default '{PIX,CASH,CARD}'
    check (cardinality(payment_methods) > 0),
  pix_key text not null default '' check (char_length(pix_key) <= 140),
  pix_holder_name text not null default '' check (char_length(pix_holder_name) <= 120),
  -- Textos editáveis da vitrine (hero, história, produtores).
  content jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.store_settings default values;

-- -----------------------------------------------------------------------------
-- Auditoria e proteção
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 60),
  entity_id text,
  summary text not null default '' check (char_length(summary) <= 500),
  changes jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);
