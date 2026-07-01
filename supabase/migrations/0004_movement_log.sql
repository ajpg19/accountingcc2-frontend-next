-- Log de movimientos: registra automáticamente cada alta, edición o borrado
-- de la tabla transactions, sea cual sea el origen (app, importación CSV,
-- o incluso un cambio manual desde el SQL Editor de Supabase).
--
-- Implementado con un trigger a nivel de base de datos (en vez de logging
-- solo desde el frontend) para que quede constancia de TODO cambio real en
-- la tabla, no solo de los que pasan por la interfaz web.

-- 1. Tabla del log
create table if not exists movement_log (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid, -- sin FK a propósito: el registro debe sobrevivir aunque se borre la transacción
  action text not null check (action in ('insert', 'update', 'delete')),
  changed_by text, -- email de quien hizo el cambio (auth.jwt de la sesión que ejecuta el trigger)
  changed_at timestamptz not null default now(),
  old_data jsonb, -- estado anterior (update/delete)
  new_data jsonb -- estado nuevo (insert/update)
);

create index if not exists idx_movement_log_transaction on movement_log(transaction_id);
create index if not exists idx_movement_log_changed_at on movement_log(changed_at desc);

-- 2. Función del trigger.
--    SECURITY DEFINER: corre con los privilegios del dueño (postgres en
--    Supabase, con BYPASSRLS), así el insert en movement_log no depende de
--    que el usuario final tenga permiso de escritura en esa tabla.
create or replace function log_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'INSERT') then
    insert into movement_log (transaction_id, action, changed_by, new_data)
    values (NEW.id, 'insert', coalesce(auth.jwt() ->> 'email', 'system'), to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    insert into movement_log (transaction_id, action, changed_by, old_data, new_data)
    values (NEW.id, 'update', coalesce(auth.jwt() ->> 'email', 'system'), to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'DELETE') then
    insert into movement_log (transaction_id, action, changed_by, old_data)
    values (OLD.id, 'delete', coalesce(auth.jwt() ->> 'email', 'system'), to_jsonb(OLD));
    return OLD;
  end if;
  return null;
end;
$$;

-- Por si el owner de la función no fuera "postgres" en tu proyecto:
-- alter function log_transaction_change() owner to postgres;

drop trigger if exists trg_transactions_log on transactions;
create trigger trg_transactions_log
after insert or update or delete on transactions
for each row execute function log_transaction_change();

-- 3. RLS: los usuarios permitidos solo pueden LEER el log.
--    No hay policy de insert/update/delete para el rol authenticated: el
--    único camino para escribir es el trigger (que corre como definer y
--    bypassa RLS), así el historial no se puede manipular desde la app.
alter table movement_log enable row level security;

create policy "allowed users read movement_log" on movement_log
  for select using (is_allowed_user());
