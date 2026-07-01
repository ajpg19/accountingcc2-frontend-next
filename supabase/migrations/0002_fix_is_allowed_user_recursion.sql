-- Fix: is_allowed_user() causaba recursión infinita en RLS.
--
-- Al ser SECURITY INVOKER (el default), la función corre con los privilegios
-- del rol que la llama (anon/authenticated). Su propia consulta interna
-- "select ... from allowed_emails" quedaba entonces sujeta a la política RLS
-- de allowed_emails, que vuelve a invocar is_allowed_user() para evaluarse,
-- que vuelve a consultar allowed_emails... recursión infinita hasta
-- "stack depth limit exceeded" (54001). Esto rompía TODAS las tablas
-- protegidas por RLS (categories, members, transactions, etc.), ya que
-- todas dependen de esta función.
--
-- Al marcarla SECURITY DEFINER, se ejecuta con los privilegios de su dueño
-- (normalmente "postgres" en Supabase, que tiene BYPASSRLS), así que su
-- consulta interna a allowed_emails ya no vuelve a evaluar RLS.

create or replace function is_allowed_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from allowed_emails
    where email = (auth.jwt() ->> 'email')
  );
$$;

-- Por si el owner no fuera "postgres" en tu proyecto (poco probable si la
-- creaste desde el SQL Editor de Supabase), descomenta esta línea:
-- alter function is_allowed_user() owner to postgres;
