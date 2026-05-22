-- WardFlow Phase 2 — staff login codes + ER arrival fields.
-- Adds per-user random login codes for nurses + doctors (wf_id stays as the
-- displayed identifier). Extends er_intake_reports with door-side arrival data.

-- ============================================================================
-- 1. random login-code generator (10 chars, no confusables 0/O/1/I/L)
-- ============================================================================
create or replace function public.generate_login_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..10 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ============================================================================
-- 2. nurses.login_code + doctors.login_code (unique, backfilled, NOT NULL)
-- ============================================================================
alter table public.nurses
  add column if not exists login_code text;
alter table public.doctors
  add column if not exists login_code text;

create unique index if not exists ux_nurses_login_code
  on public.nurses(login_code) where login_code is not null;
create unique index if not exists ux_doctors_login_code
  on public.doctors(login_code) where login_code is not null;

do $$
declare
  r record;
  c text;
  attempts int;
begin
  for r in select user_id from public.nurses where login_code is null loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      c := public.generate_login_code();
      begin
        update public.nurses set login_code = c where user_id = r.user_id;
        exit;
      exception when unique_violation then
        if attempts > 20 then raise; end if;
      end;
    end loop;
  end loop;

  for r in select user_id from public.doctors where login_code is null loop
    attempts := 0;
    loop
      attempts := attempts + 1;
      c := public.generate_login_code();
      begin
        update public.doctors set login_code = c where user_id = r.user_id;
        exit;
      exception when unique_violation then
        if attempts > 20 then raise; end if;
      end;
    end loop;
  end loop;
end $$;

alter table public.nurses alter column login_code set not null;
alter table public.doctors alter column login_code set not null;

-- ============================================================================
-- 3. extend er_intake_reports with ER-door arrival fields
-- ============================================================================
alter table public.er_intake_reports
  add column if not exists entry_at timestamptz not null default now(),
  add column if not exists arrival_reason text,
  add column if not exists er_treating_doctor_id uuid references public.users(id) on delete set null,
  add column if not exists medications_given_in_er text[] not null default '{}',
  add column if not exists assigned_ward_id uuid references public.wards(id) on delete set null;

comment on column public.er_intake_reports.entry_at is
  'Wall-clock time the patient came through the ER doors. Distinct from row created_at.';
comment on column public.er_intake_reports.arrival_reason is
  'Door-side reason (often pre-triage). chief_complaint is the post-triage clinical summary.';
comment on column public.er_intake_reports.er_treating_doctor_id is
  'ER doctor who treated the patient before ward assignment. Distinct from er_staff_user_id (the intaker).';
comment on column public.er_intake_reports.medications_given_in_er is
  'Free-text array of meds given during ER stay. Audit only; formal orders live in doctor_orders.';
comment on column public.er_intake_reports.assigned_ward_id is
  'Ward the patient will move to after ER. Does not actually move the patient — a handover_event still gates patients.ward_id.';
