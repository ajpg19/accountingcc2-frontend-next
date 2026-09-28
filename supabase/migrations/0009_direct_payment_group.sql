-- Support "direct payments": expenses paid out of pocket by a person, recorded
-- as a linked pair of movements sharing the same group_id:
--
--   * an expense (the real spending, with its category), and
--   * an income (that person's contribution / "aportación").
--
-- group_id is a client-generated UUID shared by both rows; every other movement
-- leaves it null. It lets the UI collapse the pair into a single expandable row
-- and edit/delete both movements together.
--
-- We do NOT reuse entry_ref for this: entry_ref has a unique (source, entry_ref)
-- index, so two rows with the same source could not share it.

alter table transactions add column if not exists group_id uuid;
create index if not exists idx_transactions_group on transactions(group_id);