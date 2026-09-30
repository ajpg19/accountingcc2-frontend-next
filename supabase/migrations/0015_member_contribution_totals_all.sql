-- Total contributed ("aportación") per member, WITHOUT the "real members"
-- filter used by member_contribution_totals. This one includes every member
-- that has any income assigned (e.g. Caja Rural and Juanca), so it powers the
-- "todos los que han hecho ingresos" pie chart.
--
-- Same modelling notes as 0014: contributions are INCOME rows assigned to the
-- member. security_invoker keeps RLS in effect.

drop view if exists member_contribution_totals_all;

create view member_contribution_totals_all
with (security_invoker = true) as
select
  m.id as member_id,
  m.name as member_name,
  m.color as member_color,
  coalesce(sum(t.amount) filter (where t.type = 'income'), 0)::numeric(12, 2)
    as total_income,
  count(t.id) filter (where t.type = 'income') as income_count
from members m
join transactions t
  on t.assigned_member_id = m.id
  and t.type = 'income'
group by m.id, m.name, m.color
having sum(t.amount) filter (where t.type = 'income') > 0
order by total_income desc;

comment on view member_contribution_totals_all is
  'Total income (contributions) for every member that has any income, including Caja Rural and Juanca. Respects RLS via security_invoker.';
