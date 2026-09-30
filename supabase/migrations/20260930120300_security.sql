-- =============================================================================
-- Segurança: RLS em todas as tabelas e privilégios mínimos.
--
-- anon          : lê o catálogo ativo; chama get_public_store_config e
--                 get_public_order (pelo token do link).
-- authenticated : só vê/altera algo se tiver profile ativo.
--                 STAFF (atendente): pedidos e disponibilidade dos produtos.
--                 OWNER (dono/dona): tudo, incluindo preços, configurações e equipe.
-- service_role  : Edge Functions (criar pedido, enviar e-mails, equipe).
-- Pedidos não têm escrita direta: só pelas funções.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.order_notifications enable row level security;
alter table public.rate_limits enable row level security;

-- -----------------------------------------------------------------------------
-- Privilégios de tabela
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.categories, public.products to anon, authenticated;
grant select on
  public.profiles,
  public.store_settings,
  public.orders,
  public.order_items,
  public.order_events,
  public.order_notifications
to authenticated;
grant insert, update, delete on public.categories, public.products to authenticated;
grant update on public.store_settings to authenticated;

-- Tabelas futuras nascem fechadas: precisam de RLS e GRANT explícitos.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy store_settings_select on public.store_settings
  for select to authenticated
  using ((select public.is_staff()));
create policy store_settings_update on public.store_settings
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create policy categories_select on public.categories
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));
create policy categories_insert on public.categories
  for insert to authenticated with check ((select public.is_owner()));
create policy categories_update on public.categories
  for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy categories_delete on public.categories
  for delete to authenticated using ((select public.is_owner()));

create policy products_select on public.products
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));
create policy products_insert on public.products
  for insert to authenticated with check ((select public.is_owner()));
create policy products_update on public.products
  for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
create policy products_delete on public.products
  for delete to authenticated using ((select public.is_owner()));

create policy orders_select on public.orders
  for select to authenticated using ((select public.is_staff()));
create policy order_items_select on public.order_items
  for select to authenticated using ((select public.is_staff()));
create policy order_events_select on public.order_events
  for select to authenticated using ((select public.is_staff()));
create policy order_notifications_select on public.order_notifications
  for select to authenticated using ((select public.is_staff()));

-- rate_limits: sem políticas (somente service_role).

-- -----------------------------------------------------------------------------
-- Funções: nada é executável por padrão; liberamos uma a uma.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Usadas pelas políticas RLS
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;

-- Públicas
grant execute on function public.get_public_store_config() to anon, authenticated, service_role;
grant execute on function public.get_public_order(text) to anon, authenticated;

-- Equipe (cada função confere o login internamente)
grant execute on function public.order_next_statuses(public.order_status, public.fulfillment_type) to authenticated;
grant execute on function public.admin_set_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.admin_set_paid(uuid, boolean) to authenticated;
grant execute on function public.admin_set_delivery_fee(uuid, integer) to authenticated;
grant execute on function public.admin_set_internal_notes(uuid, text) to authenticated;
grant execute on function public.admin_set_product_stock(uuid, boolean, integer) to authenticated;

-- Edge Functions
grant execute on function public.create_order(jsonb) to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Storage: fotos dos produtos. Leitura pública pela URL; envio só pelo dono.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/webp', 'image/avif', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy product_images_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_owner()));
create policy product_images_storage_update on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_owner()))
  with check (bucket_id = 'product-images' and (select public.is_owner()));
create policy product_images_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_owner()));
create policy product_images_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_staff()));

-- -----------------------------------------------------------------------------
-- Realtime: o painel recebe pedidos novos na hora (RLS continua valendo).
-- Se o WebSocket cair, o painel atualiza por polling.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end;
$$;
