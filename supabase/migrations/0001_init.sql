-- Gastos Casa - esquema inicial
-- Ejecutar en el SQL Editor de tu proyecto Supabase (Dashboard -> SQL Editor -> New query)

-- 1. Emails con acceso permitido (allowlist de login)
create table if not exists allowed_emails (
  email text primary key
);

insert into allowed_emails (email) values
  ('ajpg19@gmail.com'),
  ('gsedano98@gmail.com')
on conflict (email) do nothing;

-- 2. Miembros de la casa (a quien se le asignan gastos/ingresos).
--    No todos tienen por qué tener login propio.
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  color text default '#6366f1',
  created_at timestamptz not null default now()
);

-- 3. Categorías
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#94a3b8',
  created_at timestamptz not null default now()
);

insert into categories (name, color) values
  ('Vivienda / Hipoteca', '#ef4444'),
  ('Comunidad', '#f97316'),
  ('Luz', '#eab308'),
  ('Agua', '#0ea5e9'),
  ('Gas', '#f59e0b'),
  ('Internet / Teléfono', '#8b5cf6'),
  ('Seguros', '#14b8a6'),
  ('Supermercado', '#22c55e'),
  ('Mantenimiento / Hogar', '#64748b'),
  ('Muebles / Decoración', '#a855f7'),
  ('Ocio', '#ec4899'),
  ('Transporte', '#06b6d4'),
  ('Salud', '#f43f5e'),
  ('Otros', '#94a3b8'),
  ('Ingreso', '#16a34a')
on conflict (name) do nothing;

-- 4. Transacciones (gastos e ingresos, sin reparto: cada uno se asigna a una persona)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('expense', 'income')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  description text,
  merchant text,
  occurred_on date not null default current_date,
  category_id uuid references categories(id) on delete set null,
  assigned_member_id uuid references members(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'receipt', 'csv')),
  raw_import_row jsonb,
  created_by text, -- email de quien lo creó
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_occurred_on on transactions(occurred_on);
create index if not exists idx_transactions_member on transactions(assigned_member_id);
create index if not exists idx_transactions_category on transactions(category_id);

-- 5. Tickets / facturas (imagen + extracción de Claude)
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references transactions(id) on delete cascade,
  storage_path text,
  merchant text,
  receipt_date date,
  total_amount numeric(12,2),
  tax_amount numeric(12,2),
  raw_text text,
  extracted_json jsonb,
  created_at timestamptz not null default now()
);

-- 6. Líneas de detalle de cada ticket/factura: la "base de conocimiento"
--    (ej: 4 sillas ref 123123, color negro, madera, modelo X)
create table if not exists receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references receipts(id) on delete cascade,
  description text,
  reference text, -- SKU / referencia del producto
  quantity numeric(10,2) default 1,
  unit_price numeric(12,2),
  total_price numeric(12,2),
  color text,
  material text,
  model text,
  category text,
  attributes jsonb, -- cualquier otro detalle que detecte Claude (talla, dimensiones, etc.)
  created_at timestamptz not null default now()
);

create index if not exists idx_receipt_items_receipt on receipt_items(receipt_id);
create index if not exists idx_receipt_items_reference on receipt_items(reference);

-- 7. Registro de importaciones CSV (metadatos)
create table if not exists csv_imports (
  id uuid primary key default gen_random_uuid(),
  filename text,
  imported_by text,
  row_count int,
  created_at timestamptz not null default now()
);

-- === Row Level Security ===
-- Solo los emails de la allowlist (autenticados con Google via Supabase Auth)
-- pueden leer/escribir. Como es una app de un solo hogar, el check es simple.

alter table allowed_emails enable row level security;
alter table members enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table receipts enable row level security;
alter table receipt_items enable row level security;
alter table csv_imports enable row level security;

create or replace function is_allowed_user()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from allowed_emails
    where email = (auth.jwt() ->> 'email')
  );
$$;

create policy "allowed users full access - allowed_emails select" on allowed_emails
  for select using (is_allowed_user());

create policy "allowed users full access - members" on members
  for all using (is_allowed_user()) with check (is_allowed_user());

create policy "allowed users full access - categories" on categories
  for all using (is_allowed_user()) with check (is_allowed_user());

create policy "allowed users full access - transactions" on transactions
  for all using (is_allowed_user()) with check (is_allowed_user());

create policy "allowed users full access - receipts" on receipts
  for all using (is_allowed_user()) with check (is_allowed_user());

create policy "allowed users full access - receipt_items" on receipt_items
  for all using (is_allowed_user()) with check (is_allowed_user());

create policy "allowed users full access - csv_imports" on csv_imports
  for all using (is_allowed_user()) with check (is_allowed_user());

-- === Storage bucket para fotos de tickets ===
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "allowed users read receipts bucket"
  on storage.objects for select
  using (bucket_id = 'receipts' and is_allowed_user());

create policy "allowed users upload receipts bucket"
  on storage.objects for insert
  with check (bucket_id = 'receipts' and is_allowed_user());

create policy "allowed users delete receipts bucket"
  on storage.objects for delete
  using (bucket_id = 'receipts' and is_allowed_user());

-- Seed opcional de miembros: descomenta y ajusta nombres si quieres precargarlos
-- insert into members (name, email) values
--   ('Albert', 'ajpg19@gmail.com'),
--   ('Gsedano', 'gsedano98@gmail.com');
