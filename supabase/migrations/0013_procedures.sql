-- WardFlow Phase 2 — diagnostic procedures (x-ray, blood test, CT, MRI, etc.)
-- Doctors order procedures, anyone in the patient's care chain can view.
-- Order fields are immutable once placed; result fields are mutable until
-- status='completed' (after which only result_media_id may be updated for
-- attaching a finalised report).

-- ============================================================================
-- 1. enums
-- ============================================================================
do $$ begin
  create type procedure_kind as enum (
    'xray','blood_test','ct_scan','mri','ultrasound','ecg',
    'urine_test','biopsy','culture','endoscopy','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type procedure_status as enum (
    'ordered','in_progress','completed','cancelled'
  );
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. procedures table
-- ============================================================================
create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  intake_id uuid references public.er_intake_reports(id) on delete set null,
  kind procedure_kind not null,
  status procedure_status not null default 'ordered',
  ordered_by uuid not null references public.users(id) on delete restrict,
  ordered_at timestamptz not null default now(),
  notes text,
  performed_by uuid references public.users(id) on delete set null,
  performed_at timestamptz,
  result_summary text,
  result_values jsonb,
  result_media_id uuid references public.media_uploads(id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.users(id) on delete set null,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
alter table public.procedures enable row level security;
create index if not exists idx_procedures_patient
  on public.procedures(patient_id, ordered_at desc);
create index if not exists idx_procedures_intake on public.procedures(intake_id);
create index if not exists idx_procedures_status on public.procedures(status);

-- updated_at touch
do $$ begin
  drop trigger if exists trg_touch_updated_at on public.procedures;
  create trigger trg_touch_updated_at before update on public.procedures
    for each row execute function public.touch_updated_at();
end $$;

-- ============================================================================
-- 3. immutability of order fields once placed
-- ============================================================================
create or replace function public.guard_procedure_order_immutable()
returns trigger language plpgsql as $$
begin
  if new.kind is distinct from old.kind
     or new.patient_id is distinct from old.patient_id
     or new.ordered_by is distinct from old.ordered_by
     or new.ordered_at is distinct from old.ordered_at
     or new.intake_id is distinct from old.intake_id then
    raise exception
      'WardFlow: procedure order fields are immutable (kind/patient_id/ordered_by/ordered_at/intake_id)';
  end if;
  return new;
end;
$$;

do $$ begin
  drop trigger if exists trg_guard_procedure_order_immutable on public.procedures;
  create trigger trg_guard_procedure_order_immutable before update on public.procedures
    for each row execute function public.guard_procedure_order_immutable();
end $$;

-- ============================================================================
-- 4. RLS — doctors order + edit, nurses/family can read on their patient
-- ============================================================================
drop policy if exists "procedures scoped read" on public.procedures;
create policy "procedures scoped read" on public.procedures
  for select using (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor()
    or (public.is_nurse() and public.nurse_can_see_patient(procedures.patient_id))
    or procedures.patient_id = public.family_patient_id()
  );

drop policy if exists "procedures doctor insert" on public.procedures;
create policy "procedures doctor insert" on public.procedures
  for insert with check (
    public.is_admin() or public.is_supervisor() or public.is_doctor()
  );

drop policy if exists "procedures doctor update" on public.procedures;
create policy "procedures doctor update" on public.procedures
  for update using (
    public.is_admin() or public.is_supervisor() or public.is_doctor()
  );

comment on table public.procedures is
  'Diagnostic procedures (x-ray, blood, CT, MRI, etc). Doctors order + complete; nurses follow doctor procedures (read-only). Order fields immutable once placed.';
