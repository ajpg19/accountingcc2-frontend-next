-- Total contributed ("aportación") per member, exposed as a view for instant
-- reporting.
--
-- In this shared-pot model the money a person puts in is recorded as INCOME
-- rows assigned to them: direct-payment contributions (the income side of a
-- "directo") and bank incomes. The expense side of a "directo" belongs to the
-- shared pot (assigned_member_id is null), so summing expenses per member would
-- be wrong — we sum income instead.
--
-- Why a plain view (not materialized): the dataset is small (household
-- accounting) so the aggregation is effectively instant, and a regular view is
-- always up to date automatically — no refresh triggers to maintain.
--
-- security_invoker = true makes the view run with the querying user's
-- privileges, so the existing RLS policies on transactions / members
-- (is_allowed_user()) still apply. Without it the view owner would bypass RLS.
--
-- We report only the three real members, grouped by the member the movement is
-- assigned to. They are pinned by id (not name) so renaming a member never
-- breaks the report. Replace the placeholder UUIDs below with the real ids
-- (run: select id, name from members;).

-- Drop any earlier version of this reporting view before recreating it.
drop view if exists member_expense_totals;
drop view if exists member_contribution_totals;

create view member_contribution_totals
with (security_invoker = true) as
select
  m.id as member_id,
  m.name as member_name,
  m.color as member_color,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric(12, 2)
    as total_income,
  count(t.id) filter (where t.type = 'income') as income_count
from members m
left join transactions t on t.assigned_member_id = m.id
where m.id in (
  '893a52a1-f232-4334-8781-8eff3c047976', -- Juan_Fer
  '5ab2fd28-21a8-46c2-9af3-ce3349f841d9', -- Glenda
  '76dbae0a-78e5-436e-816e-5e8cc44ba599'  -- Alberto
)
group by m.id, m.name, m.color
order by total_income desc;

comment on view member_contribution_totals is
  'Total income (contributions) assigned to each real member. Respects RLS via security_invoker.';
