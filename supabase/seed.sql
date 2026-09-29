-- =============================================================================
-- Seed de DESENVOLVIMENTO LOCAL (executado por `supabase db reset`).
-- Nunca é aplicado em produção pelo `supabase db push`.
-- Dados de contato, PIX e endereços abaixo são fictícios: configure os reais no
-- painel (/admin/configuracoes).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configurações
-- -----------------------------------------------------------------------------
update public.store_settings
   set store_name = 'Doceria',
       tagline = 'Cookies artesanais em Cachoeiro de Itapemirim',
       legal_name = 'Doceria (exemplo local)',
       whatsapp_number = '5528999990000',
       instagram_handle = 'doceria.cookies',
       contact_email = 'contato@doceria.local',
       privacy_contact_email = 'privacidade@doceria.local',
       wix_site_url = 'https://www.exemplo.com.br',
       public_location_label = 'Cachoeiro de Itapemirim - ES',
       pickup_address = 'Rua de Exemplo, 100, Centro, Cachoeiro de Itapemirim - ES',
       pickup_instructions = 'Toque o interfone e informe o código do pedido.',
       origin_address = 'Praça Jerônimo Monteiro, Centro, Cachoeiro de Itapemirim - ES, 29300-170',
       origin_lat = -20.848889,
       origin_lng = -41.112778,
       min_order_cents = 2000,
       free_delivery_min_subtotal_cents = 15000,
       delivery_max_distance_m = 12000,
       min_lead_time_minutes = 60,
       slot_interval_minutes = 60,
       max_days_ahead = 7,
       business_hours = '{"1":[["09:00","21:00"]],"2":[["09:00","21:00"]],"3":[["09:00","21:00"]],"4":[["09:00","21:00"]],"5":[["09:00","21:00"]],"6":[["09:00","21:00"]],"7":[["09:00","21:00"]]}',
       delivery_hours = '{"1":[["09:00","21:00"]],"2":[["09:00","21:00"]],"3":[["09:00","21:00"]],"4":[["09:00","21:00"]],"5":[["09:00","21:00"]],"6":[["09:00","21:00"]],"7":[["09:00","21:00"]]}',
       pix_key = 'pix@doceria.local',
       pix_holder_name = 'Doceria Exemplo',
       content = '{
         "heroEyebrow": "Fornadas pequenas, todos os dias",
         "heroTitle": "Cookies grandes, borda crocante e centro macio.",
         "heroSubtitle": "Massa descansada por 24 horas, manteiga de verdade e chocolate em pedaços. Feitos à mão, em pequenos lotes, aqui em Cachoeiro de Itapemirim.",
         "storyTitle": "Duas pessoas, um forno e muita paciência.",
         "storyText": "A Doceria nasceu na cozinha de casa, testando receita atrás de receita até chegar no cookie que a gente queria comer: generoso, dourado por fora e macio por dentro. Hoje seguimos do mesmo jeito, produzindo em pequenas fornadas para que cada caixa chegue fresca.",
         "producers": [
           {"name": "Produtor(a) 1", "role": "Forno e massas"},
           {"name": "Produtor(a) 2", "role": "Receitas e atendimento"}
         ],
         "differentials": [
           {"title": "Massa de 24 horas", "text": "O descanso da massa aprofunda o sabor e garante a textura."},
           {"title": "Ingredientes de verdade", "text": "Manteiga, chocolate nobre e nada de aromatizante artificial."},
           {"title": "Fornadas pequenas", "text": "Produzimos pouco por vez para entregar sempre fresco."}
         ]
       }'::jsonb
 where id;

-- -----------------------------------------------------------------------------
-- Frete por faixa de distância (km)
-- -----------------------------------------------------------------------------
insert into public.delivery_rules (min_distance_m, max_distance_m, fee_cents) values
  (0, 3000, 500),
  (3000, 5000, 700),
  (5000, 8000, 1000),
  (8000, 12000, 1400);

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
insert into public.categories (id, name, slug, description, sort_order) values
  ('11111111-1111-4111-8111-000000000001', 'Clássicos', 'classicos', 'Os cookies que nunca saem do cardápio.', 1),
  ('11111111-1111-4111-8111-000000000002', 'Especiais', 'especiais', 'Recheados e sabores da casa.', 2),
  ('11111111-1111-4111-8111-000000000003', 'Combos', 'combos', 'Caixas para presentear ou dividir.', 3),
  ('11111111-1111-4111-8111-000000000004', 'Novidades', 'novidades', 'Sabores recém-saídos do forno de testes.', 4);

insert into public.products (
  id, category_id, name, slug, short_description, description, price_cents,
  compare_at_price_cents, stock_available, low_stock_threshold, is_featured,
  sort_order, allergens, ingredients, weight_grams
) values
  ('22222222-2222-4222-8222-000000000001', '11111111-1111-4111-8111-000000000001',
   'Cookie Clássico', 'cookie-classico',
   'Gotas de chocolate meio amargo e flor de sal.',
   'Nosso cookie mais pedido: massa amanteigada com açúcar mascavo, gotas de chocolate meio amargo e um toque de flor de sal por cima. Borda crocante e centro macio.',
   1200, null, 24, 6, true, 1,
   '{Glúten,Leite,Ovos,Soja}', 'Farinha de trigo, manteiga, açúcar mascavo, açúcar, ovos, chocolate meio amargo, flor de sal, fermento.', 120),
  ('22222222-2222-4222-8222-000000000002', '11111111-1111-4111-8111-000000000001',
   'Duplo Chocolate', 'duplo-chocolate',
   'Massa de cacau com pedaços de chocolate ao leite.',
   'Para quem acha que chocolate nunca é demais: massa com cacau 50% e pedaços generosos de chocolate ao leite.',
   1300, null, 18, 5, false, 2,
   '{Glúten,Leite,Ovos,Soja}', 'Farinha de trigo, manteiga, açúcar, cacau em pó, chocolate ao leite, ovos, fermento.', 120),
  ('22222222-2222-4222-8222-000000000003', '11111111-1111-4111-8111-000000000001',
   'Aveia, Mel e Castanha', 'aveia-mel-castanha',
   'Aveia em flocos, mel e castanha-do-pará.',
   'Um clássico mais rústico, com aveia em flocos, mel de florada e castanha-do-pará tostada.',
   1200, null, 10, 4, false, 3,
   '{Glúten,Leite,Ovos,Castanhas}', 'Farinha de trigo, aveia, manteiga, mel, açúcar mascavo, castanha-do-pará, ovos.', 110),
  ('22222222-2222-4222-8222-000000000004', '11111111-1111-4111-8111-000000000002',
   'Recheado de Nutella', 'recheado-de-nutella',
   'Coração cremoso de Nutella.',
   'Massa clássica com recheio generoso de Nutella que derrete quando o cookie está morno.',
   1500, null, 12, 4, true, 1,
   '{Glúten,Leite,Ovos,Soja,Avelã}', 'Farinha de trigo, manteiga, açúcar mascavo, ovos, creme de avelã com cacau (Nutella), chocolate.', 140),
  ('22222222-2222-4222-8222-000000000005', '11111111-1111-4111-8111-000000000002',
   'Red Velvet', 'red-velvet',
   'Massa aveludada com recheio de cream cheese.',
   'Massa red velvet com cacau suave, gotas de chocolate branco e recheio de cream cheese.',
   1500, null, 8, 4, true, 2,
   '{Glúten,Leite,Ovos,Soja}', 'Farinha de trigo, manteiga, açúcar, cacau, corante alimentício, cream cheese, chocolate branco, ovos.', 140),
  ('22222222-2222-4222-8222-000000000006', '11111111-1111-4111-8111-000000000002',
   'Pistache', 'pistache',
   'Creme de pistache e chocolate branco.',
   'Massa com pistache triturado, recheio de creme de pistache e pedaços de chocolate branco.',
   1800, null, 4, 5, false, 3,
   '{Glúten,Leite,Ovos,Pistache}', 'Farinha de trigo, manteiga, açúcar, pistache, creme de pistache, chocolate branco, ovos.', 140),
  ('22222222-2222-4222-8222-000000000007', '11111111-1111-4111-8111-000000000002',
   'Doce de Leite com Flor de Sal', 'doce-de-leite-flor-de-sal',
   'Doce de leite artesanal e flor de sal.',
   'Massa amanteigada, recheio de doce de leite artesanal e flor de sal para equilibrar.',
   1500, null, 0, 4, false, 4,
   '{Glúten,Leite,Ovos}', 'Farinha de trigo, manteiga, açúcar mascavo, doce de leite, flor de sal, ovos.', 140),
  ('22222222-2222-4222-8222-000000000008', '11111111-1111-4111-8111-000000000003',
   'Caixa com 4 Clássicos', 'caixa-4-classicos',
   'Quatro cookies clássicos em caixa para presente.',
   'Caixa com quatro Cookies Clássicos embalados individualmente. Ideal para presentear.',
   4400, 4800, 6, 2, false, 1,
   '{Glúten,Leite,Ovos,Soja}', 'Ver Cookie Clássico.', 480),
  ('22222222-2222-4222-8222-000000000009', '11111111-1111-4111-8111-000000000003',
   'Caixa Degustação (6 especiais)', 'caixa-degustacao-6',
   'Seis sabores especiais para provar tudo.',
   'Uma unidade de cada especial da semana. A composição pode variar conforme a fornada.',
   8400, 9000, 3, 2, false, 2,
   '{Glúten,Leite,Ovos,Soja,Avelã,Pistache}', 'Varia conforme a composição da caixa.', 840),
  ('22222222-2222-4222-8222-000000000010', '11111111-1111-4111-8111-000000000004',
   'Café com Chocolate Branco', 'cafe-chocolate-branco',
   'Café coado na massa e chocolate branco.',
   'Novidade da casa: café especial incorporado à massa com pedaços de chocolate branco.',
   1400, null, 15, 5, true, 1,
   '{Glúten,Leite,Ovos,Soja}', 'Farinha de trigo, manteiga, açúcar mascavo, café, chocolate branco, ovos.', 120);

-- -----------------------------------------------------------------------------
-- Equipe local (senha: doceria-local-123). Somente para desenvolvimento.
-- -----------------------------------------------------------------------------
do $$
declare
  v_users jsonb := '[
    {"id": "33333333-3333-4333-8333-000000000001", "email": "owner@doceria.local", "name": "Dono Local", "role": "OWNER"},
    {"id": "33333333-3333-4333-8333-000000000002", "email": "admin@doceria.local", "name": "Admin Local", "role": "ADMIN"},
    {"id": "33333333-3333-4333-8333-000000000003", "email": "operador@doceria.local", "name": "Operador Local", "role": "OPERATOR"}
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
