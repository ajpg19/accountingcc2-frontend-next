-- Permite crear un member solo con el email en el primer login.
-- El nombre se completa después desde la vista de miembros (Settings).
alter table members alter column name drop not null;
