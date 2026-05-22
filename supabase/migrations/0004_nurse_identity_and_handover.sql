-- WardFlow Phase 1 — nurse identity extension + ER→ward handover chain + bedside visit confirmations.
-- Builds on 0001 (base schema), 0002 (RLS helpers), 0003 (prevent_audit_modify trigger).
-- RLS for the new tables lives in 0006. Immutability triggers in 0007.

-- ============================================================================
-- 1. enums
-- ============================================================================
do $$ begin
  create type wf_role_prefix as enum ('NUR','DOC','SUP');
exception when duplicate_object then null; end $$;

do $$ begin
  create type handover_proposal_status as enum (
    'pending','accepted','declined','cancelled','expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type confirmation_method as enum (
    'patient_fingerprint','patient_tap','photo_fallback',
    'family_witness','two_nurse_witness'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_rating as enum ('good','ok','poor','not_happy');
exception when duplicate_object then null; end $$;

do $$ begin
  create type doctor_order_kind as enum (
    'medication','treatment_note','photo_request','video_request','vitals_request'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type doctor_assignment_origin as enum ('bedside_fingerprint','remote_authenticated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type cognitive_status as enum ('alert','confused','unconscious');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. WF-{NUR|DOC|SUP}-NNNNNN sequences + generator
-- ============================================================================
create sequence if not exists public.wf_nur_seq start 1;
create sequence if not exists public.wf_doc_seq start 1;
create sequence if not exists public.wf_sup_seq start 1;

create or replace function public.next_wardflow_id(p wf_role_prefix)
returns text language plpgsql as $$
declare
  n bigint;
begin
  case p
    when 'NUR' then n := nextval('public.wf_nur_seq');
    when 'DOC' then n := nextval('public.wf_doc_seq');
    when 'SUP' then n := nextval('public.wf_sup_seq');
  end case;
  return 'WF-' || p::text || '-' || lpad(n::text, 6, '0');
end;
$$;

-- ============================================================================
-- 3. extend nurses (identity fields per spec)
-- ============================================================================
alter table public.nurses
  add column if not exists wf_id text unique,
  add column if not exists age integer check (age between 16 and 120),
  add column if not exists gender text check (gender in ('M','F','X')),
  add column if not exists home_address text,
  add column if not exists whatsapp_e164 text,
  add column if not exists emergency_contact jsonb,
  add column if not exists years_experience numeric(4,1),
  add column if not exists specialization text,
  add column if not exists shift_type text, -- 'day','night','rotating'
  add column if not exists languages text[] default '{}',
  add column if not exists employment_start_date date,
  add column if not exists pin_hash text,            -- bcrypt; verified by /api/visits/confirm
  add column if not exists biometric_enrolled boolean not null default false,
  add column if not exists qr_badge_token text unique,
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists compliance_score numeric(5,2),     -- 0-100, computed
  add column if not exists medication_accuracy_pct numeric(5,2),
  add column if not exists missed_rounds_count integer not null default 0,
  add column if not exists emergencies_handled_count integer not null default 0;

-- Backfill WF-NUR-NNNNNN for existing rows that lack one.
update public.nurses set wf_id = public.next_wardflow_id('NUR') where wf_id is null;
alter table public.nurses alter column wf_id set not null;

-- ============================================================================
-- 4. extend doctors
-- ============================================================================
alter table public.doctors
  add column if not exists wf_id text unique,
  add column if not exists languages text[] default '{}',
  add column if not exists is_online boolean not null default false,
  add column if not exists last_seen_at timestamptz;

update public.doctors set wf_id = public.next_wardflow_id('DOC') where wf_id is null;
alter table public.doctors alter column wf_id set not null;

-- ============================================================================
-- 5. extend patients (cognitive status drives rating advisory + witness fallback)
-- ============================================================================
alter table public.patients
  add column if not exists cognitive_status cognitive_status not null default 'alert',
  add column if not exists er_handover_completed_at timestamptz,
  -- Anti-coercion: ratings from non-alert patients are advisory only.
  add column if not exists patient_fingerprint_enrolled boolean not null default false;

-- ============================================================================
-- 6. nurse_certifications (free-form list)
-- ============================================================================
create table if not exists public.nurse_certifications (
  id uuid primary key default gen_random_uuid(),
  nurse_user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  issued_by text,
  issued_at date,
  expires_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.nurse_certifications enable row level security;
create index if not exists idx_certs_nurse on public.nurse_certifications(nurse_user_id);

-- ============================================================================
-- 7. handover_proposals — ER staff proposes ward nurse(s)
-- ============================================================================
create table if not exists public.handover_proposals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  proposed_by uuid not null references public.users(id) on delete restrict,
  from_ward_id uuid references public.wards(id) on delete set null, -- usually ER
  to_ward_id uuid not null references public.wards(id) on delete restrict,
  notes text,
  pending_tasks text,
  medication_status text,
  patient_condition text,
  status handover_proposal_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.handover_proposals enable row level security;
create index if not exists idx_proposals_patient on public.handover_proposals(patient_id, created_at desc);
create index if not exists idx_proposals_status on public.handover_proposals(status, expires_at);

-- Junction: which nurses were proposed + per-nurse accept/decline
create table if not exists public.handover_proposal_nurses (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.handover_proposals(id) on delete cascade,
  nurse_user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'primary' check (role in ('primary','backup')),
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  acceptance_method confirmation_method,
  created_at timestamptz not null default now(),
  unique (proposal_id, nurse_user_id)
);
alter table public.handover_proposal_nurses enable row level security;
create index if not exists idx_proposal_nurses_nurse
  on public.handover_proposal_nurses(nurse_user_id, accepted_at);

-- ============================================================================
-- 8. handover_events — IMMUTABLE chain of patient-of-record transfers
-- ============================================================================
create table if not exists public.handover_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  proposal_id uuid references public.handover_proposals(id) on delete set null,
  outgoing_nurse_id uuid references public.users(id) on delete restrict, -- nullable for ER→ward
  incoming_nurse_id uuid not null references public.users(id) on delete restrict,
  outgoing_role text, -- 'er','primary_nurse','backup_nurse'
  incoming_role text not null default 'primary',
  to_ward_id uuid references public.wards(id) on delete set null,
  notes text,
  pending_tasks text,
  medication_status text,
  patient_condition text,
  acceptance_method confirmation_method not null,
  superseded_at timestamptz, -- set when another handover takes over the patient
  superseded_by uuid references public.handover_events(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.handover_events enable row level security;
create index if not exists idx_handover_patient on public.handover_events(patient_id, created_at desc);
create index if not exists idx_handover_incoming on public.handover_events(incoming_nurse_id, created_at desc);

-- At most one ACTIVE primary handover per patient at any time.
create unique index if not exists ux_handover_active_primary
  on public.handover_events(patient_id)
  where superseded_at is null and incoming_role = 'primary';

-- ============================================================================
-- 9. doctor_assignments — IMMUTABLE log of doctor-to-patient assignments
-- ============================================================================
create table if not exists public.doctor_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_user_id uuid not null references public.users(id) on delete restrict,
  primary_nurse_id uuid references public.users(id) on delete set null,
  backup_nurse_id uuid references public.users(id) on delete set null,
  origin doctor_assignment_origin not null,
  notes text,
  superseded_at timestamptz,
  superseded_by uuid references public.doctor_assignments(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.doctor_assignments enable row level security;
create index if not exists idx_docassign_patient on public.doctor_assignments(patient_id, created_at desc);
create unique index if not exists ux_docassign_active
  on public.doctor_assignments(patient_id)
  where superseded_at is null;

-- ============================================================================
-- 10. visit_confirmations — IMMUTABLE bedside visit-witness records
-- ============================================================================
create table if not exists public.visit_confirmations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  nurse_user_id uuid not null references public.users(id) on delete restrict,
  scheduled_visit_id uuid, -- FK added in 0005 once scheduled_visits exists
  method confirmation_method not null,
  witness_nurse_id uuid references public.users(id) on delete restrict,
  witness_family_contact_id uuid references public.family_contacts(id) on delete set null,
  signature_payload jsonb, -- biometric / tap timestamp / photo url metadata
  photo_url text,
  device_id text,
  client_seq bigint,        -- offline queue ordering
  client_nonce text,        -- offline dedup
  offline_queued_at timestamptz, -- non-null = was offline when captured
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Two-nurse witness must be a different nurse
  constraint chk_witness_distinct
    check (witness_nurse_id is null or witness_nurse_id <> nurse_user_id),
  -- Two-nurse witness method requires witness_nurse_id
  constraint chk_two_nurse_requires_witness
    check (method <> 'two_nurse_witness' or witness_nurse_id is not null),
  -- Family witness method requires family contact
  constraint chk_family_requires_contact
    check (method <> 'family_witness' or witness_family_contact_id is not null),
  -- Photo fallback requires photo_url
  constraint chk_photo_requires_url
    check (method <> 'photo_fallback' or photo_url is not null)
);
alter table public.visit_confirmations enable row level security;
create index if not exists idx_visitconf_patient on public.visit_confirmations(patient_id, occurred_at desc);
create index if not exists idx_visitconf_nurse on public.visit_confirmations(nurse_user_id, occurred_at desc);
-- Offline replays: prevent duplicate inserts on reconnect.
create unique index if not exists ux_visitconf_client_nonce
  on public.visit_confirmations(nurse_user_id, client_nonce)
  where client_nonce is not null;

-- Wire patient_rounds → visit_confirmations so a round can't exist without a confirmed visit.
alter table public.patient_rounds
  add column if not exists visit_confirmation_id uuid
    references public.visit_confirmations(id) on delete restrict;
create index if not exists idx_rounds_visit on public.patient_rounds(visit_confirmation_id);

-- ============================================================================
-- 11. visit_ratings — IMMUTABLE patient-only feedback (anti-coercion)
-- ============================================================================
create table if not exists public.visit_ratings (
  id uuid primary key default gen_random_uuid(),
  visit_confirmation_id uuid not null references public.visit_confirmations(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  rating service_rating not null,
  comment text,
  is_advisory boolean not null default false, -- true when patient cognitive_status <> 'alert'
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (visit_confirmation_id)
);
alter table public.visit_ratings enable row level security;
create index if not exists idx_ratings_patient on public.visit_ratings(patient_id, submitted_at desc);

-- ============================================================================
-- 12. doctor_orders — IMMUTABLE (medication / treatment_note / photo_request / video_request / vitals_request)
-- ============================================================================
create table if not exists public.doctor_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete restrict,
  doctor_user_id uuid not null references public.users(id) on delete restrict,
  kind doctor_order_kind not null,
  origin doctor_assignment_origin not null,
  -- Medication-only fields:
  drug_name text,
  dose text,
  route text,
  schedule_cron text, -- e.g. '0 */4 * * *'
  duration text,
  -- Treatment-note / requests:
  body text,
  -- Photo / video request follow-up:
  fulfilled_media_id uuid, -- FK added below once media_uploads exists
  fulfilled_at timestamptz,
  fulfilled_by uuid references public.users(id) on delete set null,
  superseded_at timestamptz,
  superseded_by uuid references public.doctor_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_med_fields
    check (kind <> 'medication' or (drug_name is not null and dose is not null))
);
alter table public.doctor_orders enable row level security;
create index if not exists idx_orders_patient on public.doctor_orders(patient_id, created_at desc);

-- ============================================================================
-- 13. media_uploads — photo/video evidence (mutable URL only; insert is audited)
-- ============================================================================
create table if not exists public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  visit_confirmation_id uuid references public.visit_confirmations(id) on delete set null,
  doctor_order_id uuid references public.doctor_orders(id) on delete set null,
  kind text not null check (kind in ('photo','video','audio')),
  url text not null,
  mime_type text,
  bytes integer,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.media_uploads enable row level security;
create index if not exists idx_media_patient on public.media_uploads(patient_id, created_at desc);
create index if not exists idx_media_order on public.media_uploads(doctor_order_id);

-- Now wire doctor_orders.fulfilled_media_id FK.
do $$ begin
  alter table public.doctor_orders
    add constraint fk_orders_media
    foreign key (fulfilled_media_id) references public.media_uploads(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 14. ward-entry guard: a patient cannot have ward_id set without an accepted handover
-- ============================================================================
create or replace function public.guard_patient_ward_entry()
returns trigger language plpgsql as $$
begin
  -- Allow if no change to ward_id.
  if new.ward_id is null then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.ward_id is not null)
     or (tg_op = 'UPDATE' and (old.ward_id is distinct from new.ward_id)) then
    -- Admin and supervisor can override (rare bedside scenarios).
    if public.is_admin() or public.is_supervisor() then
      return new;
    end if;
    if not exists (
      select 1 from public.handover_events h
      where h.patient_id = new.id
        and h.to_ward_id = new.ward_id
        and h.superseded_at is null
    ) then
      raise exception 'WardFlow: patient % cannot enter ward % without an accepted handover_event',
        new.id, new.ward_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_patient_ward_entry on public.patients;
create trigger trg_patient_ward_entry
  before insert or update of ward_id on public.patients
  for each row execute function public.guard_patient_ward_entry();

-- ============================================================================
-- 15. user → role-extension auto-create + WF-id assignment
-- ============================================================================
create or replace function public.sync_user_role_extension()
returns trigger language plpgsql as $$
begin
  if new.role = 'nurse' then
    insert into public.nurses (user_id, wf_id)
      values (new.id, public.next_wardflow_id('NUR'))
      on conflict (user_id) do update
        set wf_id = coalesce(public.nurses.wf_id, public.next_wardflow_id('NUR'));
  elsif new.role = 'doctor' then
    insert into public.doctors (user_id, wf_id)
      values (new.id, public.next_wardflow_id('DOC'))
      on conflict (user_id) do update
        set wf_id = coalesce(public.doctors.wf_id, public.next_wardflow_id('DOC'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_user_role_extension on public.users;
create trigger trg_sync_user_role_extension
  after insert or update of role on public.users
  for each row execute function public.sync_user_role_extension();

-- ============================================================================
-- 16. updated_at triggers on mutable new tables
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array[
    'nurse_certifications','handover_proposals','media_uploads'
  ])
  loop
    execute format(
      'drop trigger if exists trg_touch_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

comment on table public.handover_events is
  'INSERT-ONLY chain of patient-of-record. Immutability enforced in 0007. Permenkes audit trail.';
comment on table public.doctor_assignments is
  'INSERT-ONLY. Immutable in 0007. Each new assignment supersedes the prior via superseded_by.';
comment on table public.visit_confirmations is
  'INSERT-ONLY. Bedside witness record. Patient fingerprint preferred; tap/photo/witness fallbacks.';
comment on table public.visit_ratings is
  'INSERT-ONLY. Patient-only post-visit feedback. is_advisory = true when patient is not cognitively alert.';
comment on table public.doctor_orders is
  'INSERT-ONLY. Medication/treatment/photo/video/vitals orders. Mutations occur via superseded_by chain.';
