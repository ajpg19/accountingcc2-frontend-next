-- Aggregated totals for the dashboard, so the page reads pre-grouped rows
-- instead of pulling raw transactions and summing them in JS (which was capped
-- at 200 rows and therefore silently undercounted).
--
-- occurred_on is a timestamptz that encodes the wall-clock date/time as a UTC
-- instant (see migration 0013). We extract the intended wall-clock date with
-- `(occurred_on at time zone 'UTC')::date`, so grouping is timezone-stable and
-- independent of the server's local zone.
--
-- security_invoker = true keeps the existing RLS on transactions in effect.

-- Daily totals (all time). Powers the 90-day area chart.
drop view if exists transaction_daily_totals;

create view transaction_daily_totals
with (security_invoker = true) as
select
  (occurred_on at time zone 'UTC')::date as day,
  coalesce(sum(amount) filter (where type = 'expense'), 0)::numeric(12, 2)
    as gastos,
  coalesce(sum(amount) filter (where type = 'income'), 0)::numeric(12, 2)
    as ingresos,
  count(*) as movimientos
from transactions
group by 1
order by 1;

comment on view transaction_daily_totals is
  'Daily expense/income totals (wall-clock date, UTC-stable). Respects RLS via security_invoker.';

-- Monthly totals (all time). Powers the "este mes" summary cards.
drop view if exists transaction_monthly_totals;

create view transaction_monthly_totals
with (security_invoker = true) as
select
  date_trunc('month', (occurred_on at time zone 'UTC'))::date as month,
  coalesce(sum(amount) filter (where type = 'expense'), 0)::numeric(12, 2)
    as gastos,
  coalesce(sum(amount) filter (where type = 'income'), 0)::numeric(12, 2)
    as ingresos,
  count(*) as movimientos
from transactions
group by 1
order by 1;

comment on view transaction_monthly_totals is
  'Monthly expense/income totals (wall-clock month, UTC-stable). Respects RLS via security_invoker.';
