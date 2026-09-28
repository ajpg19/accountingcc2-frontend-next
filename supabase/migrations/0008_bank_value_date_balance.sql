-- Persist the two bank-statement fields that were previously only kept inside
-- raw_import_row (untyped JSON):
--
--   * value_date: the bank's "Fecha valor" (when the movement is effective for
--     interest purposes), distinct from occurred_on ("Fecha de la operación").
--   * balance: the account's running balance after the movement ("Saldo"),
--     useful to reconcile our data against the bank statement.
--
-- Both are nullable: they only apply to bank movements; manual/receipt/general
-- entries leave them empty.

alter table transactions add column if not exists value_date date;
alter table transactions add column if not exists balance numeric(12,2);