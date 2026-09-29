-- =============================================================================
-- Segurança: RLS em todas as tabelas + privilégios mínimos.
--
-- anon           : lê catálogo ativo e chama RPCs públicas (config, horários,
--                  página do pedido por token).
-- authenticated  : só enxerga/alterara dados se tiver profile ativo (equipe);
--                  permissões por papel (OPERATOR < ADMIN < OWNER).
-- service_role   : Edge Functions (criação de pedido, cotação de frete).
--
-- Pedidos, estoque e pagamentos NÃO têm políticas de escrita: toda mudança
-- passa por funções SECURITY DEFINER que validam papel e regras.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.delivery_rules enable row level security;
alter table public.delivery_quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payment_records enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.store_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

-- -----------------------------------------------------------------------------
-- Privilégios de tabela (o padrão do Supabase concede tudo; restringimos).
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.products, public.product_images to anon, authenticated;

grant select on
  public.profiles,
  public.customers,
  public.customer_addresses,
  public.delivery_rules,
  public.delivery_quotes,
  public.orders,
  public.order_items,
  public.order_status_history,
  public.payment_records,
  public.inventory_reservations,
  public.inventory_movements,
  public.store_settings,
  public.audit_logs,
  public.inventory_overview
to authenticated;

grant insert, update, delete on public.categories, public.products, public.product_images, public.delivery_rules
  to authenticated;
grant update on public.store_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
-- profiles: cada um vê o próprio; equipe vê a equipe. Escrita via Edge Function.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

-- Catálogo: público vê itens ativos; equipe vê tudo; ADMIN+ edita.
create policy categories_select on public.categories
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));
create policy categories_insert on public.categories
  for insert to authenticated
  with check ((select public.has_min_role('ADMIN')));
create policy categories_update on public.categories
  for update to authenticated
  using ((select public.has_min_role('ADMIN')))
  with check ((select public.has_min_role('ADMIN')));
create policy categories_delete on public.categories
  for delete to authenticated
  using ((select public.has_min_role('ADMIN')));

create policy products_select on public.products
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));
create policy products_insert on public.products
  for insert to authenticated
  with check ((select public.has_min_role('ADMIN')));
create policy products_update on public.products
  for update to authenticated
  using ((select public.has_min_role('ADMIN')))
  with check ((select public.has_min_role('ADMIN')));
create policy products_delete on public.products
  for delete to authenticated
  using ((select public.has_min_role('ADMIN')));

create policy product_images_select on public.product_images
  for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.is_active)
    or (select public.is_staff())
  );
create policy product_images_insert on public.product_images
  for insert to authenticated
  with check ((select public.has_min_role('ADMIN')));
create policy product_images_update on public.product_images
  for update to authenticated
  using ((select public.has_min_role('ADMIN')))
  with check ((select public.has_min_role('ADMIN')));
create policy product_images_delete on public.product_images
  for delete to authenticated
  using ((select public.has_min_role('ADMIN')));

-- Clientes: somente ADMIN+ (operadores veem os dados necessários no pedido).
create policy customers_select on public.customers
  for select to authenticated
  using ((select public.has_min_role('ADMIN')));
create policy customer_addresses_select on public.customer_addresses
  for select to authenticated
  using ((select public.has_min_role('ADMIN')));

-- Entrega
create policy delivery_rules_select on public.delivery_rules
  for select to authenticated
  using ((select public.is_staff()));
create policy delivery_rules_insert on public.delivery_rules
  for insert to authenticated
  with check ((select public.has_min_role('ADMIN')));
create policy delivery_rules_update on public.delivery_rules
  for update to authenticated
  using ((select public.has_min_role('ADMIN')))
  with check ((select public.has_min_role('ADMIN')));
create policy delivery_rules_delete on public.delivery_rules
  for delete to authenticated
  using ((select public.has_min_role('ADMIN')));

create policy delivery_quotes_select on public.delivery_quotes
  for select to authenticated
  using ((select public.has_min_role('ADMIN')));

-- Pedidos e derivados: leitura pela equipe; escrita somente via RPC.
create policy orders_select on public.orders
  for select to authenticated
  using ((select public.is_staff()));
create policy order_items_select on public.order_items
  for select to authenticated
  using ((select public.is_staff()));
create policy order_status_history_select on public.order_status_history
  for select to authenticated
  using ((select public.is_staff()));
create policy payment_records_select on public.payment_records
  for select to authenticated
  using ((select public.is_staff()));
create policy inventory_reservations_select on public.inventory_reservations
  for select to authenticated
  using ((select public.is_staff()));
create policy inventory_movements_select on public.inventory_movements
  for select to authenticated
  using ((select public.is_staff()));

-- Configurações: equipe lê; ADMIN+ altera.
create policy store_settings_select on public.store_settings
  for select to authenticated
  using ((select public.is_staff()));
create policy store_settings_update on public.store_settings
  for update to authenticated
  using ((select public.has_min_role('ADMIN')))
  with check ((select public.has_min_role('ADMIN')));

-- Auditoria: ADMIN+ lê; ninguém escreve diretamente.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select public.has_min_role('ADMIN')));

-- rate_limits: sem políticas (somente service_role / funções definer).

-- -----------------------------------------------------------------------------
-- Funções: por padrão PUBLIC pode executar; revogamos tudo e liberamos o
-- mínimo necessário para cada papel.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- Usadas dentro das políticas RLS (executam no contexto de quem consulta).
grant execute on function public.role_rank(public.app_role) to anon, authenticated;
grant execute on function public.current_app_role() to anon, authenticated;
grant execute on function public.has_min_role(public.app_role) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- Públicas
grant execute on function public.get_public_store_config() to anon, authenticated;
grant execute on function public.get_fulfillment_slots(public.fulfillment_type) to anon, authenticated;
grant execute on function public.get_public_order(text) to anon, authenticated;

-- Equipe (cada função confere o papel mínimo internamente)
grant execute on function public.admin_get_order(uuid) to authenticated;
grant execute on function public.admin_transition_order(uuid, public.order_status, text, boolean) to authenticated;
grant execute on function public.admin_set_payment_status(uuid, public.payment_status, text, boolean) to authenticated;
grant execute on function public.admin_update_delivery_fee(uuid, integer, text) to authenticated;
grant execute on function public.admin_update_order_notes(uuid, text) to authenticated;
grant execute on function public.admin_create_order(jsonb) to authenticated;
grant execute on function public.inventory_adjust(uuid, public.inventory_movement_type, integer, text) to authenticated;
grant execute on function public.admin_dashboard(text, date, date) to authenticated;
grant execute on function public.admin_list_customers(text, integer, integer) to authenticated;
grant execute on function public.anonymize_customer(uuid) to authenticated;
grant execute on function public.compute_delivery_fee(integer, integer) to authenticated;
grant execute on function public.order_next_statuses(public.order_status, public.fulfillment_type) to authenticated;
grant execute on function public.payment_next_statuses(public.payment_status) to authenticated;

-- Edge Functions (service_role)
grant execute on function public.create_order(jsonb, uuid) to service_role;
grant execute on function public.compute_delivery_fee(integer, integer) to service_role;
grant execute on function public.normalize_delivery_address(jsonb) to service_role;
grant execute on function public.get_routing_origin() to service_role;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant execute on function public.expire_stale_orders(uuid[]) to service_role;
grant execute on function public.get_public_store_config() to service_role;
grant execute on function public.get_fulfillment_slots(public.fulfillment_type) to service_role;
