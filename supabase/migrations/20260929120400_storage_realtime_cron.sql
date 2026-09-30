-- =============================================================================
-- Storage (imagens de produto), Realtime (painel) e jobs agendados (pg_cron).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Storage: bucket público para leitura; escrita somente ADMIN+.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/webp', 'image/avif', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.has_min_role('ADMIN')));

create policy product_images_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.has_min_role('ADMIN')))
  with check (bucket_id = 'product-images' and (select public.has_min_role('ADMIN')));

create policy product_images_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.has_min_role('ADMIN')));

-- Listagem pela equipe (o público acessa as imagens pela URL pública).
create policy product_images_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_staff()));

-- -----------------------------------------------------------------------------
-- Realtime: notifica o painel sobre pedidos e estoque. RLS continua valendo
-- (somente a equipe recebe eventos). O painel também faz polling caso o
-- WebSocket falhe.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.products;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Jobs agendados
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;

    perform cron.schedule(
      'expire-stale-orders',
      '* * * * *',
      'select public.expire_stale_orders()'
    );

    perform cron.schedule(
      'cleanup-housekeeping',
      '17 4 * * *',
      'select public.cleanup_housekeeping()'
    );
  else
    raise notice 'pg_cron indisponível: agende public.expire_stale_orders() externamente.';
  end if;
end;
$$;
