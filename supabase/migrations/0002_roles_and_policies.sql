-- WardFlow Phase 0 — role enum + RLS policies.
-- Run AFTER 0001_init_schema.sql.

-- ---------- role enum ----------
do $$ begin
  create type user_role as enum (
    'nurse','doctor','supervisor','admin','reception','family'
  );
exception when duplicate_object then null; end $$;

-- Cast the existing users.role text column to the enum if it isn't already.
do $$
begin
  perform 1 from information_schema.columns
    where table_schema='public' and table_name='users' and column_name='role'
      and data_type='USER-DEFINED';
  if not found then
    alter table public.users alter column role type user_role using role::user_role;
  end if;
end $$;

-- ---------- helper functions ----------
create or replace function public.current_role()
returns user_role
language sql stable as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_role(r user_role)
returns boolean language sql stable as $$
  select coalesce(public.current_role() = r, false);
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.is_role('admin'); $$;

create or replace function public.is_supervisor() returns boolean
language sql stable as $$ select public.is_role('supervisor'); $$;

create or replace function public.is_doctor() returns boolean
language sql stable as $$ select public.is_role('doctor'); $$;

create or replace function public.is_nurse() returns boolean
language sql stable as $$ select public.is_role('nurse'); $$;

-- Nurse is assigned to the patient's ward?
create or replace function public.nurse_can_see_patient(p_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.patients p
    join public.nurses n on n.user_id = auth.uid()
    where p.id = p_id and p.ward_id = any(n.assigned_ward_ids)
  );
$$;

-- Family session — patient id is set as a GUC by /api/family-session.
create or replace function public.family_patient_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.family_patient_id', true), '')::uuid;
$$;

-- ============================================================
-- POLICIES
-- ============================================================

-- ---------- users ----------
drop policy if exists "users self select" on public.users;
create policy "users self select" on public.users
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "users admin insert" on public.users;
create policy "users admin insert" on public.users
  for insert with check (public.is_admin());

drop policy if exists "users admin update" on public.users;
create policy "users admin update" on public.users
  for update using (public.is_admin() or id = auth.uid());

-- ---------- wards ----------
drop policy if exists "wards readable" on public.wards;
create policy "wards readable" on public.wards
  for select using (auth.uid() is not null);
drop policy if exists "wards admin manage" on public.wards;
create policy "wards admin manage" on public.wards
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- nurses ----------
drop policy if exists "nurses self read" on public.nurses;
create policy "nurses self read" on public.nurses
  for select using (user_id = auth.uid() or public.is_admin() or public.is_supervisor());
drop policy if exists "nurses admin manage" on public.nurses;
create policy "nurses admin manage" on public.nurses
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- doctors ----------
drop policy if exists "doctors self read" on public.doctors;
create policy "doctors self read" on public.doctors
  for select using (user_id = auth.uid() or public.is_admin() or public.is_supervisor());
drop policy if exists "doctors admin manage" on public.doctors;
create policy "doctors admin manage" on public.doctors
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- patients ----------
drop policy if exists "patients role scoped" on public.patients;
create policy "patients role scoped" on public.patients
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or (public.is_doctor() and assigned_doctor_id = auth.uid())
    or (public.is_nurse() and public.nurse_can_see_patient(id))
    or id = public.family_patient_id()
  );
drop policy if exists "patients write nurse doctor" on public.patients;
create policy "patients write nurse doctor" on public.patients
  for update using (
    public.is_admin()
    or (public.is_doctor() and assigned_doctor_id = auth.uid())
    or (public.is_nurse() and public.nurse_can_see_patient(id))
  );
drop policy if exists "patients insert admin reception" on public.patients;
create policy "patients insert admin reception" on public.patients
  for insert with check (public.is_admin() or public.is_role('reception'));

-- ---------- patient_rounds ----------
drop policy if exists "rounds role scoped" on public.patient_rounds;
create policy "rounds role scoped" on public.patient_rounds
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or (public.is_doctor() and exists (
        select 1 from public.patients p
        where p.id = patient_rounds.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(patient_rounds.patient_id))
    or patient_rounds.patient_id = public.family_patient_id()
  );
drop policy if exists "rounds insert nurse" on public.patient_rounds;
create policy "rounds insert nurse" on public.patient_rounds
  for insert with check (
    public.is_nurse() and public.nurse_can_see_patient(patient_id)
  );

-- ---------- vitals ----------
drop policy if exists "vitals role scoped" on public.vitals;
create policy "vitals role scoped" on public.vitals
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or (public.is_doctor() and exists (
        select 1 from public.patients p
        where p.id = vitals.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(vitals.patient_id))
    or vitals.patient_id = public.family_patient_id()
  );
drop policy if exists "vitals insert nurse" on public.vitals;
create policy "vitals insert nurse" on public.vitals
  for insert with check (
    public.is_nurse() and public.nurse_can_see_patient(patient_id)
  );

-- ---------- medications ----------
drop policy if exists "medications scoped" on public.medications;
create policy "medications scoped" on public.medications
  for select using (
    public.is_admin()
    or (public.is_doctor() and exists (
        select 1 from public.patients p
        where p.id = medications.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(medications.patient_id))
    or medications.patient_id = public.family_patient_id()
  );
drop policy if exists "medications doctor write" on public.medications;
create policy "medications doctor write" on public.medications
  for insert with check (public.is_doctor());

-- ---------- medication_logs ----------
drop policy if exists "medlogs scoped" on public.medication_logs;
create policy "medlogs scoped" on public.medication_logs
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or exists (
      select 1 from public.medications m
      join public.patients p on p.id = m.patient_id
      where m.id = medication_logs.medication_id
        and (
          (public.is_doctor() and p.assigned_doctor_id = auth.uid())
          or (public.is_nurse() and public.nurse_can_see_patient(p.id))
          or p.id = public.family_patient_id()
        )
    )
  );
drop policy if exists "medlogs nurse insert" on public.medication_logs;
create policy "medlogs nurse insert" on public.medication_logs
  for insert with check (public.is_nurse());

-- ---------- emergencies ----------
drop policy if exists "emergencies scoped" on public.emergencies;
create policy "emergencies scoped" on public.emergencies
  for select using (
    public.is_admin()
    or public.is_supervisor()
    or (public.is_doctor() and exists (
        select 1 from public.patients p
        where p.id = emergencies.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(emergencies.patient_id))
  );
drop policy if exists "emergencies nurse insert" on public.emergencies;
create policy "emergencies nurse insert" on public.emergencies
  for insert with check (public.is_nurse() or public.is_doctor());

-- ---------- escalation_logs ----------
drop policy if exists "escalations scoped" on public.escalation_logs;
create policy "escalations scoped" on public.escalation_logs
  for select using (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor() or public.is_nurse()
  );
drop policy if exists "escalations insert" on public.escalation_logs;
create policy "escalations insert" on public.escalation_logs
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor() or public.is_nurse()
  );

-- ---------- messages ----------
drop policy if exists "messages party" on public.messages;
create policy "messages party" on public.messages
  for select using (
    from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_admin()
  );
drop policy if exists "messages insert sender" on public.messages;
create policy "messages insert sender" on public.messages
  for insert with check (from_user_id = auth.uid());

-- ---------- family_contacts ----------
drop policy if exists "family_contacts scoped" on public.family_contacts;
create policy "family_contacts scoped" on public.family_contacts
  for select using (
    public.is_admin()
    or (public.is_doctor() and exists (
        select 1 from public.patients p
        where p.id = family_contacts.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(family_contacts.patient_id))
  );
drop policy if exists "family_contacts write reception" on public.family_contacts;
create policy "family_contacts write reception" on public.family_contacts
  for all using (public.is_admin() or public.is_role('reception'))
  with check (public.is_admin() or public.is_role('reception'));

-- ---------- incident_reports ----------
drop policy if exists "incidents scoped" on public.incident_reports;
create policy "incidents scoped" on public.incident_reports
  for select using (
    public.is_admin() or public.is_supervisor()
    or reported_by = auth.uid()
  );
drop policy if exists "incidents insert staff" on public.incident_reports;
create policy "incidents insert staff" on public.incident_reports
  for insert with check (auth.uid() is not null);

-- ---------- audit_logs ----------
drop policy if exists "audit insert anyone authed" on public.audit_logs;
create policy "audit insert anyone authed" on public.audit_logs
  for insert with check (auth.uid() is not null);
drop policy if exists "audit select admin sup" on public.audit_logs;
create policy "audit select admin sup" on public.audit_logs
  for select using (public.is_admin() or public.is_supervisor());

-- ---------- family_access_codes ----------
drop policy if exists "fcodes doctor insert" on public.family_access_codes;
create policy "fcodes doctor insert" on public.family_access_codes
  for insert with check (
    public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = patient_id and p.assigned_doctor_id = auth.uid()
    )
  );
drop policy if exists "fcodes doctor select" on public.family_access_codes;
create policy "fcodes doctor select" on public.family_access_codes
  for select using (
    public.is_admin()
    or granted_by_doctor_id = auth.uid()
  );
drop policy if exists "fcodes doctor update" on public.family_access_codes;
create policy "fcodes doctor update" on public.family_access_codes
  for update using (
    public.is_admin() or granted_by_doctor_id = auth.uid()
  );

-- ---------- family_access_log ----------
drop policy if exists "facclog insert any" on public.family_access_log;
create policy "facclog insert any" on public.family_access_log
  for insert with check (true);
drop policy if exists "facclog select admin" on public.family_access_log;
create policy "facclog select admin" on public.family_access_log
  for select using (public.is_admin());

-- ---------- shifts ----------
drop policy if exists "shifts scoped" on public.shifts;
create policy "shifts scoped" on public.shifts
  for select using (
    nurse_id = auth.uid() or public.is_admin() or public.is_supervisor()
  );
drop policy if exists "shifts nurse insert" on public.shifts;
create policy "shifts nurse insert" on public.shifts
  for insert with check (nurse_id = auth.uid());
drop policy if exists "shifts supervisor update" on public.shifts;
create policy "shifts supervisor update" on public.shifts
  for update using (
    nurse_id = auth.uid() or public.is_supervisor() or public.is_admin()
  );
