-- Keyword -> category dictionary, stored in the database.
--
-- When a movement's concept/merchant text contains one of these keywords, the
-- linked category is assigned automatically (before asking the AI). Keeping
-- this in a table (instead of hardcoded in code) means:
--   * rules reference the category by its real id (a foreign key), so renaming
--     the category's display name never breaks a rule, and
--   * the dictionary can grow/be edited without a deploy.
--
-- NOTE: superseded by migration 0011, which moves these keywords onto the
-- categories table (a text[] column) and drops this table. Kept as-is because
-- it was already applied.
--
-- Matching is done in the app (case- and accent-insensitive substring match);
-- see src/lib/category-rules.ts.

create table if not exists category_keywords (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  -- Stored normalized (lowercase, no accents) so the app matches directly.
  keyword text not null,
  created_at timestamptz not null default now()
);

-- A keyword maps to a single category.
create unique index if not exists idx_category_keywords_keyword
  on category_keywords(lower(keyword));
create index if not exists idx_category_keywords_category
  on category_keywords(category_id);

alter table category_keywords enable row level security;

create policy "allowed users full access - category_keywords" on category_keywords
  for all using (is_allowed_user()) with check (is_allowed_user());

-- Seed the initial rules. Categories are looked up by name here (tolerant to
-- the "Vivienda / Hipoteca" -> "Hipoteca" rename); after this, rules live by id.
insert into category_keywords (category_id, keyword)
select c.id, k.keyword
from (values
  ('7518216580', array['hipoteca', 'vivienda / hipoteca']),
  ('hidralia',   array['agua']),
  ('endesa',     array['luz']),
  ('multitranquilidad', array['seguros'])
) as k(keyword, category_names)
join categories c on lower(c.name) = any (k.category_names)
on conflict (lower(keyword)) do nothing;
