-- Move the keyword rules onto the categories table and drop the standalone
-- category_keywords table (introduced in 0010).
--
-- Keywords now live as a text[] column on each category, so they are managed
-- right from the categories nomenclator form (no extra table, no join). They
-- still belong to the category by its real id, so renaming never breaks a rule.
-- Matching lives in src/lib/category-rules.ts.

alter table categories add column if not exists keywords text[] not null default '{}';

-- Carry over any keywords already stored in category_keywords (from 0010).
update categories c
set keywords = sub.keywords
from (
  select category_id, array_agg(keyword order by keyword) as keywords
  from category_keywords
  group by category_id
) sub
where sub.category_id = c.id;

drop table if exists category_keywords;
