-- WardFlow Phase 1 — care schedules + 30-min SLA alerts.
-- A scheduled_visit slips into "red" if no confirmed visit_confirmation arrives within 30 min
-- of its due_at. The hospital-wide dashboard polls compute_due_visits() to surface red cards
-- with an audible chime.

-- ============================================================================
-- 1. enums
-- ============================================================================
do $$ begin
  create type schedule_kind as enum ('round','vitals','medication','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scheduled_visit_status as enum ('pending','confirmed','missed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_kind as enum (
    'missed_round','missed_medication','unhanded_off',
    'offline_replay_review','fingerprint_anomaly','manual_red'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type alert_state as enum ('open','acknowledged','resolved');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. care_schedules — recurring pattern attached to a patient (or template)
-- ============================================================================
create table if not exists public.care_schedules (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  kind schedule_kind not null,
  doctor_order_id uuid references public.doctor_orders(id) on delete set null,
  interval_minutes integer not null check (interval_minutes between 5 and 1440),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  description text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.care_schedules enable row level security;
create index if not exists idx_schedules_patient on public.care_schedules(patient_id, kind);

-- ============================================================================
-- 3. scheduled_visits — materialized per-occurrence rows the dashboard reads
-- ============================================================================
create table if not exists public.scheduled_visits (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.care_schedules(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  due_at timestamptz not null,
  status scheduled_visit_status not null default 'pending',
  confirmed_by_visit_id uuid references public.visit_confirmations(id) on delete set null,
  confirmed_at timestamptz,
  missed_marked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (schedule_id, due_at)
);
alter table public.scheduled_visits enable row level security;
create index if not exists idx_svisits_patient_due on public.scheduled_visits(patient_id, due_at);
create index if not exists idx_svisits_status_due on public.scheduled_visits(status, due_at);

-- Wire visit_confirmations.scheduled_visit_id FK now that the target table exists.
do $$ begin
  alter table public.visit_confirmations
    add constraint fk_visitconf_svisit
    foreign key (scheduled_visit_id) references public.scheduled_visits(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 4. alerts — SLA + anomaly alerts surfaced on supervisor + dashboard
-- ============================================================================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  kind alert_kind not null,
  state alert_state not null default 'open',
  patient_id uuid references public.patients(id) on delete cascade,
  nurse_user_id uuid references public.users(id) on delete set null,
  scheduled_visit_id uuid references public.scheduled_visits(id) on delete set null,
  payload jsonb,
  opened_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.alerts enable row level security;
create index if not exists idx_alerts_state_opened on public.alerts(state, opened_at desc);
create index if not exists idx_alerts_patient on public.alerts(patient_id, opened_at desc);
-- At most one OPEN alert per (kind, patient, scheduled_visit) to avoid duplicate chimes.
create unique index if not exists ux_alerts_open_dedup
  on public.alerts(kind, patient_id, scheduled_visit_id)
  where state = 'open';

-- ============================================================================
-- 5. alert_acknowledgements — IMMUTABLE supervisor sign-off
-- ============================================================================
create table if not exists public.alert_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete restrict,
  supervisor_user_id uuid not null references public.users(id) on delete restrict,
  reason_note text not null,
  acknowledged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.alert_acknowledgements enable row level security;
create index if not exists idx_ackalerts_alert on public.alert_acknowledgements(alert_id);

-- ============================================================================
-- 6. supervisor_overrides — IMMUTABLE forced reassignment / patient-state correction
-- ============================================================================
create table if not exists public.supervisor_overrides (
  id uuid primary key default gen_random_uuid(),
  supervisor_user_id uuid not null references public.users(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  prior_nurse_id uuid references public.users(id) on delete set null,
  new_nurse_id uuid references public.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now()
);
alter table public.supervisor_overrides enable row level security;
create index if not exists idx_overrides_patient on public.supervisor_overrides(patient_id, created_at desc);

-- ============================================================================
-- 7. compute_due_visits() — flips pending → missed when more than 30 min past due
--    and opens an alerts row. Idempotent. Call from a cron worker every minute.
-- ============================================================================
create or replace function public.compute_due_visits(grace_minutes integer default 30)
returns table (
  flipped_to_missed integer,
  alerts_opened integer
)
language plpgsql security definer as $$
declare
  miss_count integer := 0;
  alert_count integer := 0;
begin
  -- Flip pending → missed for past-due visits with no confirmation.
  with flipped as (
    update public.scheduled_visits sv
    set status = 'missed',
        missed_marked_at = now()
    where sv.status = 'pending'
      and sv.due_at + make_interval(mins => grace_minutes) < now()
      and sv.confirmed_by_visit_id is null
    returning sv.id, sv.patient_id
  )
  select count(*) into miss_count from flipped;

  -- Open one alert per newly-missed visit.
  insert into public.alerts (kind, state, patient_id, scheduled_visit_id, payload, opened_at)
  select 'missed_round'::alert_kind, 'open'::alert_state,
         sv.patient_id, sv.id,
         jsonb_build_object('due_at', sv.due_at, 'minutes_late',
           extract(epoch from (now() - sv.due_at))/60),
         now()
  from public.scheduled_visits sv
  where sv.status = 'missed'
    and sv.missed_marked_at > now() - interval '2 minutes'
  on conflict on constraint ux_alerts_open_dedup do nothing;

  get diagnostics alert_count = row_count;

  return query select miss_count, alert_count;
end;
$$;

-- ============================================================================
-- 8. updated_at triggers on mutable new tables
-- ============================================================================
do $$
declare t text;
begin
  for t in select unnest(array['care_schedules','scheduled_visits','alerts'])
  loop
    execute format(
      'drop trigger if exists trg_touch_updated_at on public.%I;', t);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

comment on table public.alert_acknowledgements is
  'INSERT-ONLY (0007). Supervisor sign-off on red alerts. Permenkes audit trail.';
comment on table public.supervisor_overrides is
  'INSERT-ONLY (0007). Forced nurse reassignments and patient-state corrections.';
comment on function public.compute_due_visits is
  'Call every minute from a worker (pg_cron / external scheduler). Flips pending visits to missed after grace window and opens one alert per newly-missed visit (deduped).';
