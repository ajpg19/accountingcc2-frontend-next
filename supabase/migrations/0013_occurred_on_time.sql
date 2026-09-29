-- Preserve the movement time.
--
-- "Fecha de la operación" on bank statements carries a time of day, but
-- occurred_on was a `date` and silently dropped it. Widen it to timestamptz so
-- the time is stored.
--
-- Storage convention (see src/lib/utils.ts wallClockToUTC / formatOccurred):
-- occurred_on holds the wall-clock date/time encoded as a UTC instant, so its
-- first 10 chars are always the calendar day and formatting it back in UTC
-- yields the exact wall-clock time. This keeps day-based grouping/filtering
-- (which slice the ISO string) correct and avoids browser/server timezone drift.
--
-- Existing date-only rows are therefore interpreted as UTC midnight, so they
-- keep displaying at their original day with no spurious time.
alter table transactions
  alter column occurred_on type timestamptz
    using (occurred_on::timestamp) at time zone 'UTC';

alter table transactions
  alter column occurred_on set default now();

-- idx_transactions_occurred_on stays valid (a b-tree index works the same on
-- timestamptz), so it is left in place.