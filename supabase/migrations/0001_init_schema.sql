-- WardFlow Phase 0 — initial schema.
-- 16 core tables + 2 family-portal tables. uuid PKs, audit columns on user-data tables.
--
-- NOTE: RLS is *enabled* here but policies live in 0002_roles_and_policies.sql.
-- The audit_logs immutability trigger lives in 0003_audit_immutable.sql.

create extension if not exists "pgcrypto";

-- ---------- enums ----------
do $$ begin
  create type risk_level as enum ('green','yellow','orange','red');
exception when duplicate_object then null; end $$;

do $$ begin
  create type emergency_kind as enum (
    'cardiac','respiratory','fall','aggressive','medication_reaction','unknown'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type medication_status as enum ('given','missed','refused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_locale as enum ('id','en');
exception when duplicate_object then null; end $$;

-- user_role enum is created in 0002_roles_and_policies.sql so the policy file is
-- self-contained for review.

-- ---------- 1. users ----------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null, -- see user_role enum in 0002
  language app_locale not null default 'id',
  is_active boolean not null default true,
  last_login_at timestamptz,
  photo_url text,
  phone_e164 text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.users enable row level security;

-- ---------- 2. wards ----------
create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  floor text,
  capacity integer not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.wards enable row level security;

-- ---------- 3. nurses (extends users) ----------
create table if not exists public.nurses (
  user_id uuid primary key references public.users(id) on delete cascade,
  assigned_ward_ids uuid[] not null default '{}',
  shift_start_at timestamptz,
  shift_end_at timestamptz,
  license_no text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.nurses enable row level security;

-- ---------- 4. doctors (extends users) ----------
create table if not exists public.doctors (
  user_id uuid primary key references public.users(id) on delete cascade,
  specialty text,
  license_no text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.doctors enable row level security;

-- ---------- 5. patients ----------
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  photo_url text,
  dob date,
  gender text check (gender in ('M','F','X')),
  ward_id uuid references public.wards(id) on delete set null,
  bed_no text,
  diagnosis text,
  allergies text[] default '{}',
  blood_type text,
  risk_level risk_level not null default 'green',
  assigned_doctor_id uuid references public.users(id) on delete set null,
  assigned_nurse_id uuid references public.users(id) on delete set null,
  admitted_at timestamptz not null default now(),
  emergency_contact jsonb,
  insurance jsonb,
  family_contacts jsonb,
  current_medications jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.patients enable row level security;
create index if not exists idx_patients_ward on public.patients(ward_id);
create index if not exists idx_patients_doctor on public.patients(assigned_doctor_id);
create index if not exists idx_patients_nurse on public.patients(assigned_nurse_id);

-- ---------- 6. shifts ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  nurse_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ward_ids uuid[] not null default '{}',
  handover_summary text,
  supervisor_approved_at timestamptz,
  supervisor_approved_by uuid references public.users(id) on delete set null,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.shifts enable row level security;

-- ---------- 8. vitals (defined before patient_rounds so vitals_id FK resolves) ----------
create table if not exists public.vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid not null references public.users(id) on delete restrict,
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  temperature_c numeric(4,1),
  oxygen_pct integer,
  heart_rate_bpm integer,
  pain_score integer check (pain_score between 0 and 10),
  respiratory_rate integer,
  recorded_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.vitals enable row level security;
create index if not exists idx_vitals_patient_recorded on public.vitals(patient_id, recorded_at desc);

-- ---------- 7. patient_rounds ----------
create table if not exists public.patient_rounds (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  nurse_id uuid not null references public.users(id) on delete restrict,
  round_at timestamptz not null default now(),
  vitals_id uuid references public.vitals(id) on delete set null,
  notes text,
  photo_urls text[],
  missed_fields jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.patient_rounds enable row level security;
create index if not exists idx_rounds_patient on public.patient_rounds(patient_id, round_at desc);

-- ---------- 9. medications ----------
create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  drug_name text not null,
  dosage text,
  route text,
  frequency text,
  prescribed_by uuid references public.users(id),
  prescribed_at timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.medications enable row level security;

-- ---------- 10. medication_logs ----------
create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  administered_by uuid not null references public.users(id),
  administered_at timestamptz not null default now(),
  dose_given text,
  witness_user_id uuid references public.users(id),
  status medication_status not null,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.medication_logs enable row level security;

-- ---------- 11. emergencies ----------
create table if not exists public.emergencies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  triggered_by uuid not null references public.users(id),
  kind emergency_kind not null default 'unknown',
  triggered_at timestamptz not null default now(),
  resolved_at timestamptz,
  timeline jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.emergencies enable row level security;
create index if not exists idx_emergencies_patient on public.emergencies(patient_id, triggered_at desc);

-- ---------- 12. escalation_logs ----------
create table if not exists public.escalation_logs (
  id uuid primary key default gen_random_uuid(),
  emergency_id uuid references public.emergencies(id) on delete cascade,
  round_id uuid references public.patient_rounds(id) on delete cascade,
  level integer not null check (level between 1 and 4),
  level_actor_user_id uuid references public.users(id),
  level_at timestamptz not null default now(),
  message text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  check (emergency_id is not null or round_id is not null)
);
alter table public.escalation_logs enable row level security;

-- ---------- 13. messages ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id),
  to_user_id uuid not null references public.users(id),
  patient_id uuid references public.patients(id) on delete set null,
  body text,
  voice_url text,
  is_urgent boolean not null default false,
  read_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.messages enable row level security;
create index if not exists idx_messages_to on public.messages(to_user_id, created_at desc);

-- ---------- 14. family_contacts ----------
create table if not exists public.family_contacts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  full_name text not null,
  relationship text,
  phone_e164 text,
  email text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.family_contacts enable row level security;

-- ---------- 15. incident_reports ----------
create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete set null,
  reported_by uuid not null references public.users(id),
  kind text,
  severity text,
  description text,
  photo_urls text[],
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.incident_reports enable row level security;

-- ---------- 16. audit_logs ----------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  device_id text,
  occurred_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index if not exists idx_audit_actor on public.audit_logs(actor_user_id, occurred_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);

-- ---------- 17. family_access_codes ----------
create table if not exists public.family_access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  patient_id uuid not null references public.patients(id) on delete cascade,
  granted_by_doctor_id uuid not null references public.users(id),
  allowed_sections jsonb not null default '[]',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.family_access_codes enable row level security;
create index if not exists idx_family_codes_patient on public.family_access_codes(patient_id);

-- ---------- 18. family_access_log ----------
create table if not exists public.family_access_log (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  accessed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  sections_viewed text[] not null default '{}'
);
alter table public.family_access_log enable row level security;

-- ---------- updated_at trigger helper ----------
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Attach the trigger to every user-data table.
do $$
declare t text;
begin
  for t in select unnest(array[
    'users','wards','nurses','doctors','patients','shifts','vitals','patient_rounds',
    'medications','medication_logs','emergencies','escalation_logs','messages',
    'family_contacts','incident_reports'
  ])
  loop
    execute format(
      'drop trigger if exists trg_touch_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;
