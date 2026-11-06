-- ShopChristmas — schema isolado (prefixo sc_ no schema public).
-- Mesmo projeto Supabase pode coexistir com a loja Utilidades Pra Casa.
-- PIX via MercosulPay é o único método ativo; cartão é futuro (tokenização).
-- Nenhum PAN/CVV deve ser persistido aqui — nunca.

create extension if not exists pgcrypto;

-- ---------- enums ----------
do $$ begin
  create type sc_order_status as enum (
    'pending_payment', 'paid', 'processing', 'shipped', 'delivered',
    'cancelled', 'refunded', 'payment_failed', 'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type sc_payment_status as enum (
    'created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired', 'refunded'
  );
exception when duplicate_object then null; end $$;

-- ---------- catálogo ----------
create table if not exists sc_products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  image_url text,
  price_cents int not null check (price_cents >= 0),
  compare_at_cents int check (compare_at_cents >= 0),
  pix_discount_percent int not null default 0 check (pix_discount_percent between 0 and 100),
  shipping_cents int not null default 0 check (shipping_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- pedidos ----------
create table if not exists sc_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  access_token uuid not null default gen_random_uuid(), -- acesso de convidado ao acompanhamento
  email text not null,
  customer_name text,
  phone text,
  shipping_address jsonb,
  currency text not null default 'BRL',
  subtotal_cents int not null check (subtotal_cents >= 0),
  pix_discount_cents int not null default 0 check (pix_discount_cents >= 0),
  shipping_cents int not null default 0 check (shipping_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  status sc_order_status not null default 'pending_payment',
  payment_method text not null default 'pix' check (payment_method = 'pix'),
  utm jsonb not null default '{}',
  idempotency_key text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sc_orders_status_idx on sc_orders (status, created_at desc);
create index if not exists sc_orders_email_idx on sc_orders (email);

create table if not exists sc_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sc_orders (id) on delete cascade,
  product_id uuid references sc_products (id) on delete set null,
  name text not null,              -- snapshot imutável
  image_url text,
  qty int not null check (qty > 0),
  unit_price_cents int not null check (unit_price_cents >= 0),
  total_cents int not null check (total_cents >= 0),
  created_at timestamptz not null default now()
);
create index if not exists sc_order_items_order_idx on sc_order_items (order_id);

-- ---------- pagamentos ----------
create table if not exists sc_payment_attempts (
  payment_method text not null default 'pix' check (payment_method = 'pix'),
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sc_orders (id) on delete cascade,
  provider text not null default 'mercosulpay',
  provider_ref text,               -- charge id do provedor
  status sc_payment_status not null default 'created',
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'BRL',
  qr_code text,
  qr_code_image text,
  error text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sc_payment_attempts_ref_uniq
  on sc_payment_attempts (provider, provider_ref) where provider_ref is not null;
create index if not exists sc_payment_attempts_order_idx on sc_payment_attempts (order_id);

create table if not exists sc_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,          -- delivery id / event id do provedor
  event_type text not null,
  payload_hash text,
  payload jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

-- ---------- RLS: nenhuma política pública ----------
-- Pedidos, tentativas e eventos só são acessados pela service role (Edge Functions).
alter table sc_products enable row level security;
alter table sc_orders enable row level security;
alter table sc_order_items enable row level security;
alter table sc_payment_attempts enable row level security;
alter table sc_webhook_events enable row level security;

-- Catálogo: leitura pública somente de produtos ativos (nome, preço, imagem).
create policy "sc public read products" on sc_products
  for select using (is_active);

-- ---------- RPCs (service role apenas) ----------
-- Cria pedido atomicamente com preço recalculado no servidor.
create or replace function sc_create_order(
  p_product_slug text,
  p_email text, p_name text, p_phone text,
  p_shipping jsonb, p_utm jsonb, p_idempotency text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  prod sc_products%rowtype; oid uuid; tok uuid;
  pix_disc int; total int;
begin
  if p_idempotency is not null then
    select id, access_token into oid, tok from sc_orders where idempotency_key = p_idempotency;
    if found then
      return jsonb_build_object('ok', true, 'order_id', oid, 'duplicated', true, 'access_token', tok);
    end if;
  end if;

  select * into prod from sc_products where slug = p_product_slug and is_active for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Produto indisponível.');
  end if;

  pix_disc := round(prod.price_cents * prod.pix_discount_percent / 100.0);
  total := prod.price_cents - pix_disc + prod.shipping_cents;

  insert into sc_orders (email, customer_name, phone, shipping_address, currency,
    subtotal_cents, pix_discount_cents, shipping_cents, total_cents,
    payment_method, utm, idempotency_key, status)
  values (lower(trim(p_email)), p_name, p_phone, p_shipping, 'BRL',
    prod.price_cents, pix_disc, prod.shipping_cents, total,
    'pix', coalesce(p_utm, '{}'), p_idempotency, 'pending_payment')
  returning id, access_token into oid, tok;

  insert into sc_order_items (order_id, product_id, name, image_url, qty,
    unit_price_cents, total_cents)
  values (oid, prod.id, prod.name, prod.image_url, 1, prod.price_cents, prod.price_cents);

  return jsonb_build_object('ok', true, 'order_id', oid, 'duplicated', false,
    'access_token', tok, 'total_cents', total, 'pix_discount_cents', pix_disc);
end $$;
revoke all on function sc_create_order(text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function sc_create_order(text,text,text,text,jsonb,jsonb,text) to service_role;

-- Aplica estado confirmado pelo provedor. Nunca regride pedido pago.
create or replace function sc_apply_payment_state(
  p_order uuid, p_provider text, p_provider_ref text,
  p_amount int, p_state text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o sc_orders%rowtype; a sc_payment_attempts%rowtype;
begin
  select * into o from sc_orders where id = p_order for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Pedido não encontrado.'); end if;

  if p_amount is not null and p_amount <> o.total_cents then
    return jsonb_build_object('ok', false, 'error', 'Valor divergente do pedido.');
  end if;

  select * into a from sc_payment_attempts
    where order_id = p_order and provider = p_provider
    order by created_at desc limit 1;
  if found and p_provider_ref is not null and a.provider_ref is not null
     and a.provider_ref <> p_provider_ref then
    return jsonb_build_object('ok', false, 'error', 'Referência não confere.');
  end if;

  -- idempotência de estado: pago nunca regride
  if o.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  if o.status in ('cancelled','refunded') then
    return jsonb_build_object('ok', false, 'error', 'Pedido encerrado.');
  end if;

  if p_state in ('paid','confirmed','completed','succeeded') then
    update sc_orders set status = 'paid', paid_at = now(), updated_at = now() where id = p_order;
    if found then
      update sc_payment_attempts set status = 'succeeded',
        provider_ref = coalesce(p_provider_ref, provider_ref), updated_at = now()
      where id = a.id;
    end if;
  elsif p_state in ('failed','rejected','cancelled','expired','refunded','charged_back') then
    if o.status = 'pending_payment' then
      update sc_orders set status = case p_state
        when 'expired' then 'expired'::sc_order_status
        else 'payment_failed'::sc_order_status end,
        updated_at = now() where id = p_order;
    end if;
    if found then
      update sc_payment_attempts set status = case p_state
        when 'cancelled' then 'cancelled'::sc_payment_status
        when 'expired' then 'expired'::sc_payment_status
        when 'refunded' then 'refunded'::sc_payment_status
        else 'failed'::sc_payment_status end,
        provider_ref = coalesce(p_provider_ref, provider_ref), updated_at = now()
      where id = a.id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'already', false);
end $$;
revoke all on function sc_apply_payment_state(uuid,text,text,int,text) from public;
grant execute on function sc_apply_payment_state(uuid,text,text,int,text) to service_role;

-- Expira pedidos pendentes antigos (cron futuro).
create or replace function sc_expire_stale_orders(p_older_than interval default '2 hours')
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update sc_orders set status = 'expired', updated_at = now()
    where status = 'pending_payment' and created_at < now() - p_older_than;
  update sc_payment_attempts a set status = 'expired', updated_at = now()
    from sc_orders o where a.order_id = o.id and o.status = 'expired'
      and a.status in ('created','pending');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function sc_expire_stale_orders(interval) from public;
grant execute on function sc_expire_stale_orders(interval) to service_role;

-- ---------- seed: oferta confirmada ----------
insert into sc_products (slug, name, description, image_url,
  price_cents, compare_at_cents, pix_discount_percent, shipping_cents, is_active)
values ('kit-3-arvores-natal', 'Kit com 3 árvores de Natal',
  'Kit com 3 árvores de Natal de 1,80 m cada, com bolas, laços, estrelas e luzes. ' ||
  'Frete grátis para todo o Brasil; entrega em até 7 dias corridos.',
  '/assets/trees.webp', 10997, 24997, 0, 0, true)
on conflict (slug) do update set
  name = excluded.name, description = excluded.description,
  price_cents = excluded.price_cents, compare_at_cents = excluded.compare_at_cents,
  pix_discount_percent = excluded.pix_discount_percent,
  shipping_cents = excluded.shipping_cents, is_active = excluded.is_active;
