-- Foto de capa da página inicial e ordem do cardápio começando em 1.
-- Somente adições: nenhum dado existente é apagado.

-- Foto de capa (Storage product-images, pasta capa/). Vazia: a página
-- inicial mostra o primeiro produto em destaque, como antes.
alter table public.store_settings
  add column hero_image_path text
  check (hero_image_path is null or char_length(hero_image_path) between 3 and 300);

-- Ordem no cardápio: 1 é o primeiro. Valores antigos menores que 1 sobem
-- para 1 (a ordem relativa entre eles cai no desempate por nome).
update public.products set sort_order = 1 where sort_order < 1;
update public.categories set sort_order = 1 where sort_order < 1;
alter table public.products alter column sort_order set default 1;
alter table public.categories alter column sort_order set default 1;
alter table public.products add constraint products_sort_order_min check (sort_order >= 1);
alter table public.categories add constraint categories_sort_order_min check (sort_order >= 1);

-- Configuração pública passa a incluir a capa.
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
    'minOrderCents', s.min_order_cents,
    'heroImagePath', s.hero_image_path
  )
  from public.store_settings s
  where s.id
$$;
