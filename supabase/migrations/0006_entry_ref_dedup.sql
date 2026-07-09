-- Soporte para importar dos tipos de CSV (banco y movimientos generales) con
-- deduplicación por "número de apunte".
--
-- - entry_ref: número de apunte del movimiento. En los del banco viene en el
--   propio extracto; en los generales, el usuario asigna un código.
-- - source: se amplía con 'bank' y 'general' para distinguir el origen.
-- - Deduplicación POR ORIGEN: un mismo número de apunte puede existir una vez
--   como banco y otra como general, pero no repetirse dentro del mismo origen.

alter table transactions add column if not exists entry_ref text;

alter table transactions drop constraint if exists transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('manual', 'receipt', 'csv', 'bank', 'general'));

-- Índice único parcial: garantiza que no se repita (origen, nº apunte).
-- Las filas sin entry_ref (manual, ticket, csv antiguo) quedan excluidas.
create unique index if not exists uq_transactions_source_entry_ref
  on transactions (source, entry_ref)
  where entry_ref is not null;
