-- Free-text notes / observations for a movement. Optional, per movement.
-- Used, among other things, to record when a movement's date was left empty on
-- import and defaulted to the upload day.

alter table transactions add column if not exists notes text;
