-- Permite a los usuarios ya autorizados gestionar la allowlist de emails
-- desde la UI (antes solo existía una política de lectura).
create policy "allowed users insert allowed_emails" on allowed_emails
  for insert with check (is_allowed_user());

create policy "allowed users delete allowed_emails" on allowed_emails
  for delete using (is_allowed_user());
