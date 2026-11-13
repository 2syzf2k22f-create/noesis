alter table noesis.geo_attempts add column if not exists region text;
alter table noesis.geo_attempts add column if not exists subregion text;
alter table noesis.geo_attempts add column if not exists seconds numeric;
