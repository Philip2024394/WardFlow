-- WardFlow Phase 1 — doctor identity, ER triage intake, next-of-kin enrollment,
-- and doctor proposal/acceptance flow. Builds on 0004 (immutability triggers from 0007 will
-- be attached to the new insert-only tables at the end of this file).

-- ============================================================================
-- 1. enums
-- ============================================================================
do $$ begin
  create type doctor_proposal_status as enum (
    'pending','confirmed','declined','cancelled','expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type proposal_origin as enum ('er','doctor_self','patient','next_of_kin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type acceptance_actor as enum (
    'er_staff','patient','next_of_kin','two_physician_witness'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type severity_level as enum ('1','2','3','4','5');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. extend doctors
-- ============================================================================
alter table public.doctors
  add column if not exists specialty_keywords text[] default '{}',
  add column if not exists shift_pattern jsonb, -- {mon:[{start,end}],...}
  add column if not exists standard_fee_idr integer,            -- admin/doctor only via RLS
  add column if not exists expertise text,
  add column if not exists is_accepting_patients boolean not null default true,
  add column if not exists qr_badge_token text unique,
  add column if not exists pin_hash text,
  add column if not exists biometric_enrolled boolean not null default false,
  add column if not exists current_patient_count integer not null default 0;

-- ============================================================================
-- 3. extend family_contacts → next-of-kin enrollment
-- ============================================================================
alter table public.family_contacts
  add column if not exists is_next_of_kin boolean not null default false,
  add column if not exists auth_user_id uuid references public.users(id) on delete set null,
  add column if not exists pin_hash text,
  add column if not exists fingerprint_enrolled boolean not null default false,
  add column if not exists id_document_url text,
  add column if not exists consent_signed_at timestamptz,
  add column if not exists enrolled_at_er_by uuid references public.users(id) on delete set null,
  add column if not exists access_code text;

create unique index if not exists ux_family_contacts_access_code
  on public.family_contacts(access_code) where access_code is not null;

create index if not exists idx_family_contacts_nok_patient
  on public.family_contacts(patient_id) where is_next_of_kin = true;

-- ============================================================================
-- 4. er_intake_reports — IMMUTABLE triage report
-- ============================================================================
create table if not exists public.er_intake_reports (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  er_staff_user_id uuid not null references public.users(id) on delete restrict,
  chief_complaint text not null,
  symptom_keywords text[] not null default '{}',
  severity severity_level not null default '3',
  -- vitals snapshot (mirror of vitals shape; patient_rounds happens later)
  blood_pressure_systolic integer,
  blood_pressure_diastolic integer,
  temperature_c numeric(4,1),
  heart_rate_bpm integer,
  oxygen_pct integer,
  pain_score integer check (pain_score between 0 and 10),
  -- patient state
  cognitive_status_observed cognitive_status,
  is_conscious boolean not null default true,
  -- preferences
  preferred_gender text check (preferred_gender in ('M','F','any')) default 'any',
  preferred_languages text[] not null default '{}',
  known_allergies text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.er_intake_reports enable row level security;
create index if not exists idx_intake_patient on public.er_intake_reports(patient_id, created_at desc);

-- ============================================================================
-- 5. doctor_proposals — anyone proposes a doctor; pending until confirmed
-- ============================================================================
create table if not exists public.doctor_proposals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  target_doctor_id uuid not null references public.users(id) on delete restrict,
  proposed_by uuid not null references public.users(id) on delete restrict,
  origin proposal_origin not null,
  intake_id uuid references public.er_intake_reports(id) on delete set null,
  rank_score numeric(6,3), -- score from suggest_doctors_for_intake at proposal time
  reason text,
  status doctor_proposal_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.doctor_proposals enable row level security;
create index if not exists idx_dp_patient on public.doctor_proposals(patient_id, created_at desc);
create index if not exists idx_dp_target on public.doctor_proposals(target_doctor_id, status);

-- ============================================================================
-- 6. doctor_assignment_acceptances — IMMUTABLE record of who confirmed which doctor
-- ============================================================================
create table if not exists public.doctor_assignment_acceptances (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.doctor_proposals(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_user_id uuid not null references public.users(id) on delete restrict,
  actor acceptance_actor not null,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_family_contact_id uuid references public.family_contacts(id) on delete set null,
  method confirmation_method not null,
  signature_payload jsonb,
  emergency_exception boolean not null default false,
  two_physician_witness_id uuid references public.users(id) on delete set null,
  superseded_at timestamptz, -- when a higher-authority confirmation overrides this one
  superseded_by uuid references public.doctor_assignment_acceptances(id) on delete set null,
  created_at timestamptz not null default now(),
  -- An actor must be identifiable.
  constraint chk_actor_identifiable
    check (
      actor_user_id is not null
      or actor_family_contact_id is not null
      or actor = 'two_physician_witness'
    ),
  -- Emergency exception requires a second physician witness.
  constraint chk_emergency_needs_witness
    check (emergency_exception = false or two_physician_witness_id is not null)
);
alter table public.doctor_assignment_acceptances enable row level security;
create index if not exists idx_daa_patient on public.doctor_assignment_acceptances(patient_id, created_at desc);
create index if not exists idx_daa_proposal on public.doctor_assignment_acceptances(proposal_id);

-- ============================================================================
-- 7. extend doctor_assignments — link to intake + emergency-exception flag
-- ============================================================================
alter table public.doctor_assignments
  add column if not exists er_intake_id uuid references public.er_intake_reports(id) on delete set null,
  add column if not exists acceptance_id uuid references public.doctor_assignment_acceptances(id) on delete set null,
  add column if not exists emergency_exception boolean not null default false,
  add column if not exists two_physician_witness_id uuid references public.users(id) on delete set null;

-- ============================================================================
-- 8. doctor_public_profile view — excludes fee + PII the public side shouldn't see
-- ============================================================================
create or replace view public.doctor_public_profile as
  select
    d.user_id,
    d.wf_id,
    d.specialty,
    d.specialty_keywords,
    d.shift_pattern,
    d.expertise,
    d.is_accepting_patients,
    d.is_online,
    d.last_seen_at,
    d.current_patient_count,
    u.full_name,
    u.photo_url
  from public.doctors d
  left join public.users u on u.id = d.user_id;

comment on view public.doctor_public_profile is
  'Public-safe doctor profile — NEVER includes standard_fee_idr or pin_hash. Use this for patient/family/nurse-facing queries.';

-- ============================================================================
-- 9. suggest_doctors_for_intake — ranked doctor suggestion engine
-- ============================================================================
create or replace function public.suggest_doctors_for_intake(p_intake_id uuid)
returns table (
  doctor_user_id uuid,
  wf_id text,
  full_name text,
  specialty text,
  expertise text,
  is_online boolean,
  on_shift_now boolean,
  current_patient_count integer,
  rank_score numeric
)
language plpgsql stable security definer as $$
declare
  ir record;
  weekday_key text;
begin
  select * into ir from public.er_intake_reports where id = p_intake_id;
  if not found then return; end if;

  weekday_key := lower(trim(to_char(now(), 'dy'))); -- 'mon','tue',...

  return query
  with candidates as (
    select
      d.user_id,
      d.wf_id,
      u.full_name,
      d.specialty,
      d.expertise,
      d.is_online,
      d.current_patient_count,
      d.specialty_keywords,
      d.shift_pattern,
      d.is_accepting_patients
    from public.doctors d
    join public.users u on u.id = d.user_id
    where d.is_accepting_patients = true
  ),
  scored as (
    select
      c.user_id,
      c.wf_id,
      c.full_name,
      c.specialty,
      c.expertise,
      c.is_online,
      c.current_patient_count,
      -- specialty keyword overlap (most weight)
      coalesce(array_length(
        array(select unnest(c.specialty_keywords) intersect select unnest(ir.symptom_keywords)),
      1), 0)::numeric * 3.0
      -- on-shift now (use shift_pattern[weekday] if present)
      + case
          when c.shift_pattern is not null and c.shift_pattern ? weekday_key then 2.0
          else 0.0
        end
      -- online bonus
      + case when c.is_online then 1.0 else 0.0 end
      -- workload penalty
      - (least(c.current_patient_count, 10) * 0.2)
      as rank_score,
      (c.shift_pattern is not null and c.shift_pattern ? weekday_key) as on_shift_now
    from candidates c
  )
  select
    user_id, wf_id, full_name, specialty, expertise,
    is_online, on_shift_now, current_patient_count, rank_score
  from scored
  order by rank_score desc, current_patient_count asc
  limit 12;
end;
$$;

comment on function public.suggest_doctors_for_intake is
  'Returns ranked doctor suggestions for an ER intake. Specialty keyword overlap × on-shift × online × workload. Does not expose standard_fee_idr.';

-- ============================================================================
-- 10. updated_at triggers + immutability triggers
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array['doctor_proposals'])
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at();', t);
  end loop;

  for t in select unnest(array[
    'er_intake_reports','doctor_assignment_acceptances'
  ])
  loop
    execute format('drop trigger if exists %I_immutable on public.%I;', t, t);
    execute format(
      'create trigger %I_immutable before update or delete on public.%I
       for each row execute function public.prevent_audit_modify();', t, t);
  end loop;
end $$;

-- Controlled trigger-bypass for doctor_assignment_acceptances supersedence
-- (patient overrides NOK, etc.).
create or replace function public.supersede_doctor_acceptance(p_id uuid, p_new_id uuid)
returns void language plpgsql security definer as $$
begin
  set local session_replication_role = replica;
  update public.doctor_assignment_acceptances
     set superseded_at = now(), superseded_by = p_new_id
   where id = p_id and superseded_at is null;
end;
$$;

-- ============================================================================
-- 11. RLS — fees hidden from patient/family/nurse; intake & proposals scoped sensibly
-- ============================================================================

-- doctors table: tighten so patient/family/nurse cannot SELECT the fee column directly.
-- They should query doctor_public_profile instead. We block raw doctors SELECT for them.
drop policy if exists "doctors self read" on public.doctors;
create policy "doctors fee guarded" on public.doctors
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or user_id = auth.uid()
  );
-- Note: nurses + ER staff + patients/family read doctor data via doctor_public_profile view,
-- which omits standard_fee_idr. The view inherits no RLS of its own — but since the underlying
-- doctors row is gated, anon queries return 0 rows. We solve this with a SECURITY DEFINER
-- variant of the view exposed to all authenticated users:

create or replace function public.list_doctor_public_profiles()
returns setof public.doctor_public_profile
language sql stable security definer as $$
  select * from public.doctor_public_profile;
$$;
grant execute on function public.list_doctor_public_profiles to authenticated;

-- er_intake_reports
drop policy if exists "intake scoped read" on public.er_intake_reports;
create policy "intake scoped read" on public.er_intake_reports
  for select using (
    public.is_admin() or public.is_supervisor()
    or er_staff_user_id = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = er_intake_reports.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(er_intake_reports.patient_id))
    or er_intake_reports.patient_id = public.family_patient_id()
  );
drop policy if exists "intake er insert" on public.er_intake_reports;
create policy "intake er insert" on public.er_intake_reports
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_role('reception')
    or public.is_nurse() or public.is_doctor()
  );

-- doctor_proposals
drop policy if exists "proposals doctor scoped" on public.doctor_proposals;
create policy "proposals doctor scoped" on public.doctor_proposals
  for select using (
    public.is_admin() or public.is_supervisor()
    or target_doctor_id = auth.uid() or proposed_by = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = doctor_proposals.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(doctor_proposals.patient_id))
    or doctor_proposals.patient_id = public.family_patient_id()
  );
drop policy if exists "proposals doctor insert" on public.doctor_proposals;
create policy "proposals doctor insert" on public.doctor_proposals
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor() or public.is_nurse()
    or public.is_role('reception')
  );
drop policy if exists "proposals doctor update" on public.doctor_proposals;
create policy "proposals doctor update" on public.doctor_proposals
  for update using (
    public.is_admin() or public.is_supervisor()
    or proposed_by = auth.uid() or target_doctor_id = auth.uid()
  );

-- doctor_assignment_acceptances
drop policy if exists "daa scoped read" on public.doctor_assignment_acceptances;
create policy "daa scoped read" on public.doctor_assignment_acceptances
  for select using (
    public.is_admin() or public.is_supervisor()
    or actor_user_id = auth.uid() or doctor_user_id = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = doctor_assignment_acceptances.patient_id and p.assigned_doctor_id = auth.uid()))
    or doctor_assignment_acceptances.patient_id = public.family_patient_id()
  );
drop policy if exists "daa insert via app" on public.doctor_assignment_acceptances;
create policy "daa insert via app" on public.doctor_assignment_acceptances
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor() or public.is_nurse()
    or public.is_role('reception')
  );

-- family_contacts: NOK fields are sensitive (id_document_url, consent). Tighten reads.
drop policy if exists "family_contacts scoped" on public.family_contacts;
create policy "family_contacts scoped" on public.family_contacts
  for select using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = family_contacts.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(family_contacts.patient_id))
    or auth_user_id = auth.uid()
    or family_contacts.patient_id = public.family_patient_id()
  );
