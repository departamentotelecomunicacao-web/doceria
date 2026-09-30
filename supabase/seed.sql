-- =============================================================================
-- Seed de DESENVOLVIMENTO LOCAL (executado por `supabase db reset`).
-- Nunca é aplicado em produção pelo `supabase db push`.
-- Contatos, PIX e endereço abaixo são fictícios: em produção, configure no
-- painel (Configurações).
-- =============================================================================

update public.store_settings
   set store_name = 'Doceria',
       tagline = 'Cookies artesanais feitos em Cachoeiro de Itapemirim',
       whatsapp_phone = '+5528999990000',
       notify_email = 'pedidos@doceria.local',
       instagram_url = 'https://instagram.com/doceria.cookies',
       institutional_url = 'https://www.exemplo.com.br',
       pickup_address = 'Rua de Exemplo, 100, Centro, Cachoeiro de Itapemirim - ES',
       delivery_fee_cents = 500,
       -- Todos os dias, para os testes não dependerem do dia da semana.
       open_weekdays = '{0,1,2,3,4,5,6}',
       periods = '{MORNING,AFTERNOON}',
       same_day_orders = true,
       max_days_ahead = 14,
       pix_key = 'pix@doceria.local',
       pix_holder = 'Doceria Exemplo',
       min_order_cents = 0
 where id;

insert into public.categories (id, name, slug, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Clássicos', 'classicos', 1),
  ('11111111-1111-4111-8111-000000000002', 'Especiais', 'especiais', 2),
  ('11111111-1111-4111-8111-000000000003', 'Caixas', 'caixas', 3);

insert into public.products (
  id, category_id, name, slug, short_description, description, price_cents, stock, is_featured, sort_order
) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Cookie Clássico', 'cookie-classico', 'Gotas de chocolate meio amargo e flor de sal.',
   'Massa amanteigada com açúcar mascavo, gotas de chocolate meio amargo e flor de sal. Borda crocante e centro macio.',
   1200, null, true, 1),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001',
   'Duplo Chocolate', 'duplo-chocolate', 'Massa de cacau com pedaços de chocolate ao leite.',
   'Massa com cacau e pedaços generosos de chocolate ao leite.',
   1300, null, false, 2),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000002',
   'Recheado de Nutella', 'recheado-de-nutella', 'Coração cremoso de Nutella.',
   'Massa clássica com recheio generoso de Nutella.',
   1500, 12, true, 1),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000002',
   'Red Velvet', 'red-velvet', 'Massa aveludada com recheio de cream cheese.',
   'Massa red velvet, gotas de chocolate branco e recheio de cream cheese.',
   1500, 8, true, 2),
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'Pistache', 'pistache', 'Creme de pistache e chocolate branco.',
   'Massa com pistache, recheio de creme de pistache e chocolate branco.',
   1800, 0, false, 3),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000003',
   'Caixa com 4 Clássicos', 'caixa-4-classicos', 'Quatro cookies clássicos em caixa para presente.',
   'Quatro Cookies Clássicos embalados individualmente. Ideal para presentear.',
   4400, null, false, 1);

-- -----------------------------------------------------------------------------
-- Equipe local (senha: doceria-local-123). Somente para desenvolvimento.
-- -----------------------------------------------------------------------------
do $$
declare
  v_users jsonb := '[
    {"id": "33333333-3333-4333-8333-000000000001", "email": "dono@doceria.local", "name": "Dono Local", "role": "OWNER"},
    {"id": "33333333-3333-4333-8333-000000000002", "email": "atendente@doceria.local", "name": "Atendente Local", "role": "STAFF"}
  ]';
  u jsonb;
begin
  for u in select * from jsonb_array_elements(v_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', (u ->> 'id')::uuid, 'authenticated', 'authenticated',
      u ->> 'email', extensions.crypt('doceria-local-123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u ->> 'name'),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (u ->> 'id')::uuid, u ->> 'id',
      jsonb_build_object('sub', u ->> 'id', 'email', u ->> 'email', 'email_verified', true),
      'email', now(), now(), now()
    );

    insert into public.profiles (id, full_name, email, role)
    values ((u ->> 'id')::uuid, u ->> 'name', u ->> 'email', (u ->> 'role')::public.app_role);
  end loop;
end;
$$;
