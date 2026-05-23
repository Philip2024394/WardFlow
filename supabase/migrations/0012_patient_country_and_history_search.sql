-- WardFlow Phase 2 — patient country + returning-patient search.
-- Adds the country field requested at ER admission and the indexes/functions
-- needed to detect returning patients by (full_name, dob[, country]).

alter table public.patients
  add column if not exists country text;

comment on column public.patients.country is
  'ISO 3166-1 alpha-2 code preferred (e.g. ID, US, AU). Free-text accepted for legacy rows.';

-- Case-insensitive name match for the search.
create index if not exists idx_patients_name_dob_country
  on public.patients (lower(full_name), dob, country);

-- ============================================================================
-- search_returning_patients — case-insensitive name+dob[+country] match,
-- returns a brief per-patient summary suitable for the ER alert.
-- ============================================================================
create or replace function public.search_returning_patients(
  p_full_name text,
  p_dob date,
  p_country text default null
) returns table (
  patient_id uuid,
  full_name text,
  dob date,
  country text,
  prior_admissions_count integer,
  last_admission_at timestamptz,
  last_chief_complaint text,
  last_medications text[],
  last_ward_name text
) language plpgsql stable as $$
begin
  return query
  with matches as (
    select p.*
    from public.patients p
    where lower(p.full_name) = lower(p_full_name)
      and p.dob = p_dob
      and (p_country is null or p.country is null or p.country = p_country)
  ),
  ir as (
    select
      r.patient_id,
      count(*) over (partition by r.patient_id) as cnt,
      r.entry_at,
      r.chief_complaint,
      r.medications_given_in_er,
      r.assigned_ward_id,
      row_number() over (partition by r.patient_id order by coalesce(r.entry_at, r.created_at) desc) as rn
    from public.er_intake_reports r
  )
  select
    m.id,
    m.full_name,
    m.dob,
    m.country,
    coalesce(ir.cnt, 0)::integer,
    ir.entry_at,
    ir.chief_complaint,
    ir.medications_given_in_er,
    w.name
  from matches m
  left join ir on ir.patient_id = m.id and ir.rn = 1
  left join public.wards w on w.id = ir.assigned_ward_id;
end;
$$;

comment on function public.search_returning_patients is
  'Returning-patient detection for ER admission. Match by case-insensitive name + exact DOB; country is a soft tiebreaker that is ignored if either side is null.';
