-- =============================================================================
-- Simplificação da loja (setembro/2026)
--
-- As migrations 20260929* criaram a primeira versão (frete por distância,
-- reservas com prazo, clientes, auditoria, três papéis). A loja passou a usar
-- um modelo simples: frete fixo, estoque opcional, dois papéis e devolutiva
-- por e-mail/WhatsApp. Esta migration remove as estruturas antigas; as
-- seguintes criam o modelo novo. Migrations já aplicadas nunca são editadas.
-- =============================================================================

-- Jobs agendados da versão anterior
do $$
declare
  v_job text;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    foreach v_job in array array['expire-stale-orders', 'cleanup-housekeeping'] loop
      if exists (select 1 from cron.job where jobname = v_job) then
        perform cron.unschedule(v_job);
      end if;
    end loop;
  end if;
end;
$$;

-- Políticas do Storage (recriadas com os papéis novos)
drop policy if exists product_images_storage_insert on storage.objects;
drop policy if exists product_images_storage_update on storage.objects;
drop policy if exists product_images_storage_delete on storage.objects;
drop policy if exists product_images_storage_select on storage.objects;

drop view if exists public.inventory_overview;

drop table if exists
  public.audit_logs,
  public.rate_limits,
  public.inventory_movements,
  public.inventory_reservations,
  public.payment_records,
  public.order_status_history,
  public.order_items,
  public.orders,
  public.delivery_quotes,
  public.delivery_rules,
  public.customer_addresses,
  public.customers,
  public.product_images,
  public.products,
  public.categories,
  public.store_settings,
  public.profiles
cascade;

-- Todas as funções do schema public criadas pela versão anterior
-- (extensões instaladas em public não são tocadas).
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and not exists (
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('drop function if exists %s cascade', v_fn);
  end loop;
end;
$$;

drop type if exists
  public.app_role,
  public.order_status,
  public.payment_status,
  public.payment_method,
  public.fulfillment_type,
  public.inventory_movement_type,
  public.reservation_status,
  public.delivery_pricing_mode,
  public.order_source
cascade;
