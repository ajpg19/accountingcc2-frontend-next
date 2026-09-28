-- Independent entry reference (nº de apunte) per movement, with two separate
-- numbering spaces so they can never be confused:
--
--   * Bank movements (source = 'bank') keep the bank's own reference, taken
--     from the statement during import. We never overwrite it.
--   * Every other movement (manual, receipt, csv, general, ...) that arrives
--     without a reference gets one from its OWN sequence, prefixed with "G-"
--     so it is visibly unrelated to the bank numbering.
--
-- This is enforced with a BEFORE INSERT trigger so it applies to EVERY insert
-- path (import, manual form, receipt scan, or a direct SQL insert), not just
-- the web UI.

-- Dedicated sequence for non-bank movements.
create sequence if not exists transactions_general_entry_seq;

create or replace function set_general_entry_ref()
returns trigger
language plpgsql
as $$
begin
  -- Assign a reference only when the row does not already carry one and it is
  -- not a bank movement (bank rows bring their own reference from the import).
  if new.entry_ref is null and new.source is distinct from 'bank' then
    new.entry_ref := 'G-' || nextval('transactions_general_entry_seq');
  end if;
  return new;
end;
$$;

-- BEFORE INSERT so the reference is set before the movement_log trigger
-- (AFTER INSERT) captures the new row, and before the unique index is checked.
drop trigger if exists trg_transactions_general_entry_ref on transactions;
create trigger trg_transactions_general_entry_ref
before insert on transactions
for each row execute function set_general_entry_ref();