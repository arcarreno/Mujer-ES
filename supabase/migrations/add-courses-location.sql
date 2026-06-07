-- Add location columns to courses for presencial modality
alter table public.courses add column if not exists latitude double precision;
alter table public.courses add column if not exists longitude double precision;
alter table public.courses add column if not exists location_name text;
