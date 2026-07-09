-- Restringe la edición y eliminación de movimientos (transactions) a un único
-- usuario administrador (ajpg19@gmail.com). El resto de usuarios permitidos
-- pueden seguir consultando (SELECT) e insertar (INSERT) movimientos.

-- Función auxiliar: ¿es el usuario administrador?
create or replace function is_admin_user()
returns boolean
language sql
stable
as $$
  select (auth.jwt() ->> 'email') = 'ajpg19@gmail.com';
$$;

-- Se elimina la política única "for all" y se sustituye por políticas por comando.
drop policy if exists "allowed users full access - transactions" on transactions;

-- Lectura: cualquier usuario permitido.
create policy "transactions select - allowed users" on transactions
  for select using (is_allowed_user());

-- Alta: cualquier usuario permitido.
create policy "transactions insert - allowed users" on transactions
  for insert with check (is_allowed_user());

-- Edición: solo el administrador.
create policy "transactions update - admin only" on transactions
  for update using (is_admin_user()) with check (is_admin_user());

-- Borrado: solo el administrador.
create policy "transactions delete - admin only" on transactions
  for delete using (is_admin_user());
