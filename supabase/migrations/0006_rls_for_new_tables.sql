-- WardFlow Phase 1 — RLS policies for tables added in 0004 and 0005.
-- Reuses the existing helpers from 0002: is_admin/is_supervisor/is_doctor/is_nurse,
-- nurse_can_see_patient(uuid), family_patient_id().

-- Helper: is the nurse explicitly the assigned (primary or backup) for the patient?
-- Cheaper than re-running nurse_can_see_patient when we just need the explicit assignment.
create or replace function public.nurse_is_assigned_to(p_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.handover_events h
    where h.patient_id = p_id
      and h.incoming_nurse_id = auth.uid()
      and h.superseded_at is null
  )
  or exists (
    select 1
    from public.doctor_assignments da
    where da.patient_id = p_id
      and (da.primary_nurse_id = auth.uid() or da.backup_nurse_id = auth.uid())
      and da.superseded_at is null
  );
$$;

-- ============================================================================
-- nurse_certifications
-- ============================================================================
drop policy if exists "certs scoped read" on public.nurse_certifications;
create policy "certs scoped read" on public.nurse_certifications
  for select using (
    nurse_user_id = auth.uid()
    or public.is_admin() or public.is_supervisor()
    -- Doctors can see certs of nurses assigned to their patients (anonymous in family view).
    or (public.is_doctor() and exists (
      select 1 from public.doctor_assignments da
      where (da.primary_nurse_id = nurse_certifications.nurse_user_id
             or da.backup_nurse_id = nurse_certifications.nurse_user_id)
        and da.doctor_user_id = auth.uid()
        and da.superseded_at is null))
  );
drop policy if exists "certs self insert" on public.nurse_certifications;
create policy "certs self insert" on public.nurse_certifications
  for insert with check (nurse_user_id = auth.uid() or public.is_admin());
drop policy if exists "certs admin update" on public.nurse_certifications;
create policy "certs admin update" on public.nurse_certifications
  for update using (public.is_admin() or nurse_user_id = auth.uid());

-- ============================================================================
-- handover_proposals
-- ============================================================================
drop policy if exists "proposals scoped read" on public.handover_proposals;
create policy "proposals scoped read" on public.handover_proposals
  for select using (
    public.is_admin() or public.is_supervisor()
    or proposed_by = auth.uid()
    or exists (
      select 1 from public.handover_proposal_nurses hpn
      where hpn.proposal_id = handover_proposals.id
        and hpn.nurse_user_id = auth.uid())
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = handover_proposals.patient_id and p.assigned_doctor_id = auth.uid()))
  );
drop policy if exists "proposals er insert" on public.handover_proposals;
create policy "proposals er insert" on public.handover_proposals
  for insert with check (
    public.is_nurse() or public.is_doctor() or public.is_supervisor() or public.is_admin()
  );
drop policy if exists "proposals status update" on public.handover_proposals;
create policy "proposals status update" on public.handover_proposals
  for update using (
    public.is_admin() or public.is_supervisor() or proposed_by = auth.uid()
  );

-- ============================================================================
-- handover_proposal_nurses
-- ============================================================================
drop policy if exists "proposal_nurses scoped read" on public.handover_proposal_nurses;
create policy "proposal_nurses scoped read" on public.handover_proposal_nurses
  for select using (
    public.is_admin() or public.is_supervisor()
    or nurse_user_id = auth.uid()
    or exists (
      select 1 from public.handover_proposals hp
      where hp.id = handover_proposal_nurses.proposal_id and hp.proposed_by = auth.uid())
  );
drop policy if exists "proposal_nurses creator insert" on public.handover_proposal_nurses;
create policy "proposal_nurses creator insert" on public.handover_proposal_nurses
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or exists (
      select 1 from public.handover_proposals hp
      where hp.id = proposal_id and hp.proposed_by = auth.uid())
  );
drop policy if exists "proposal_nurses self accept" on public.handover_proposal_nurses;
create policy "proposal_nurses self accept" on public.handover_proposal_nurses
  for update using (nurse_user_id = auth.uid() or public.is_admin() or public.is_supervisor());

-- ============================================================================
-- handover_events (insert-only; reads by everyone with patient access)
-- ============================================================================
drop policy if exists "handover scoped read" on public.handover_events;
create policy "handover scoped read" on public.handover_events
  for select using (
    public.is_admin() or public.is_supervisor()
    or incoming_nurse_id = auth.uid() or outgoing_nurse_id = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = handover_events.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(handover_events.patient_id))
    or handover_events.patient_id = public.family_patient_id()
  );
drop policy if exists "handover insert" on public.handover_events;
create policy "handover insert" on public.handover_events
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or incoming_nurse_id = auth.uid()
    or exists (
      select 1 from public.handover_proposals hp
      where hp.id = proposal_id and hp.proposed_by = auth.uid())
  );

-- ============================================================================
-- doctor_assignments
-- ============================================================================
drop policy if exists "docassign scoped read" on public.doctor_assignments;
create policy "docassign scoped read" on public.doctor_assignments
  for select using (
    public.is_admin() or public.is_supervisor()
    or doctor_user_id = auth.uid()
    or primary_nurse_id = auth.uid() or backup_nurse_id = auth.uid()
    or doctor_assignments.patient_id = public.family_patient_id()
  );
drop policy if exists "docassign doctor insert" on public.doctor_assignments;
create policy "docassign doctor insert" on public.doctor_assignments
  for insert with check (
    (public.is_doctor() and doctor_user_id = auth.uid())
    or public.is_admin() or public.is_supervisor()
  );

-- ============================================================================
-- visit_confirmations
-- ============================================================================
drop policy if exists "visitconf scoped read" on public.visit_confirmations;
create policy "visitconf scoped read" on public.visit_confirmations
  for select using (
    public.is_admin() or public.is_supervisor()
    or nurse_user_id = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = visit_confirmations.patient_id and p.assigned_doctor_id = auth.uid()))
    or visit_confirmations.patient_id = public.family_patient_id()
  );
drop policy if exists "visitconf nurse insert" on public.visit_confirmations;
create policy "visitconf nurse insert" on public.visit_confirmations
  for insert with check (
    public.is_nurse() and (
      public.nurse_is_assigned_to(patient_id)
      or public.nurse_can_see_patient(patient_id)
    )
  );

-- ============================================================================
-- visit_ratings (patient-only insert via a dedicated server action)
-- ============================================================================
drop policy if exists "ratings scoped read" on public.visit_ratings;
create policy "ratings scoped read" on public.visit_ratings
  for select using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = visit_ratings.patient_id and p.assigned_doctor_id = auth.uid()))
    or visit_ratings.patient_id = public.family_patient_id()
  );
-- Inserts arrive via the bedside endpoint using a server-side service client
-- (so the patient doesn't need an auth.uid()). Block all RLS inserts; only
-- the service-role bypass writes here. We still record patient_id explicitly.
drop policy if exists "ratings no client insert" on public.visit_ratings;
create policy "ratings no client insert" on public.visit_ratings
  for insert with check (public.is_admin());

-- ============================================================================
-- doctor_orders
-- ============================================================================
drop policy if exists "orders scoped read" on public.doctor_orders;
create policy "orders scoped read" on public.doctor_orders
  for select using (
    public.is_admin() or public.is_supervisor()
    or doctor_user_id = auth.uid()
    or (public.is_nurse() and (
      public.nurse_is_assigned_to(patient_id)
      or public.nurse_can_see_patient(patient_id)))
    -- Family sees treatment notes and request fulfilment but not medication detail.
    or (doctor_orders.patient_id = public.family_patient_id()
        and kind <> 'medication')
  );
drop policy if exists "orders doctor insert" on public.doctor_orders;
create policy "orders doctor insert" on public.doctor_orders
  for insert with check (
    (public.is_doctor() and doctor_user_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "orders nurse fulfil" on public.doctor_orders;
create policy "orders nurse fulfil" on public.doctor_orders
  for update using (
    public.is_admin() or public.is_supervisor()
    or (public.is_nurse() and (
      public.nurse_is_assigned_to(patient_id)
      or public.nurse_can_see_patient(patient_id)))
  );

-- ============================================================================
-- media_uploads
-- ============================================================================
drop policy if exists "media scoped read" on public.media_uploads;
create policy "media scoped read" on public.media_uploads
  for select using (
    public.is_admin() or public.is_supervisor()
    or uploaded_by = auth.uid()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = media_uploads.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(media_uploads.patient_id))
    or media_uploads.patient_id = public.family_patient_id()
  );
drop policy if exists "media staff insert" on public.media_uploads;
create policy "media staff insert" on public.media_uploads
  for insert with check (
    public.is_nurse() or public.is_doctor() or public.is_admin() or public.is_supervisor()
  );

-- ============================================================================
-- care_schedules + scheduled_visits
-- ============================================================================
drop policy if exists "schedules scoped read" on public.care_schedules;
create policy "schedules scoped read" on public.care_schedules
  for select using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = care_schedules.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(care_schedules.patient_id))
    or care_schedules.patient_id = public.family_patient_id()
  );
drop policy if exists "schedules doctor write" on public.care_schedules;
create policy "schedules doctor write" on public.care_schedules
  for all using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = care_schedules.patient_id and p.assigned_doctor_id = auth.uid()))
  ) with check (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = care_schedules.patient_id and p.assigned_doctor_id = auth.uid()))
  );

drop policy if exists "svisits scoped read" on public.scheduled_visits;
create policy "svisits scoped read" on public.scheduled_visits
  for select using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = scheduled_visits.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and public.nurse_can_see_patient(scheduled_visits.patient_id))
    or scheduled_visits.patient_id = public.family_patient_id()
  );
drop policy if exists "svisits staff write" on public.scheduled_visits;
create policy "svisits staff write" on public.scheduled_visits
  for all using (
    public.is_admin() or public.is_supervisor()
    or (public.is_nurse() and public.nurse_can_see_patient(patient_id))
  ) with check (
    public.is_admin() or public.is_supervisor()
    or (public.is_nurse() and public.nurse_can_see_patient(patient_id))
  );

-- ============================================================================
-- alerts + alert_acknowledgements + supervisor_overrides
-- ============================================================================
drop policy if exists "alerts scoped read" on public.alerts;
create policy "alerts scoped read" on public.alerts
  for select using (
    public.is_admin() or public.is_supervisor()
    or (public.is_doctor() and exists (
      select 1 from public.patients p
      where p.id = alerts.patient_id and p.assigned_doctor_id = auth.uid()))
    or (public.is_nurse() and alerts.nurse_user_id = auth.uid())
  );
drop policy if exists "alerts system insert" on public.alerts;
create policy "alerts system insert" on public.alerts
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_nurse() or public.is_doctor()
  );
drop policy if exists "alerts ack update" on public.alerts;
create policy "alerts ack update" on public.alerts
  for update using (public.is_admin() or public.is_supervisor());

drop policy if exists "ackalerts read" on public.alert_acknowledgements;
create policy "ackalerts read" on public.alert_acknowledgements
  for select using (public.is_admin() or public.is_supervisor()
    or supervisor_user_id = auth.uid());
drop policy if exists "ackalerts insert" on public.alert_acknowledgements;
create policy "ackalerts insert" on public.alert_acknowledgements
  for insert with check (
    (public.is_supervisor() and supervisor_user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "overrides read" on public.supervisor_overrides;
create policy "overrides read" on public.supervisor_overrides
  for select using (public.is_admin() or public.is_supervisor()
    or supervisor_overrides.patient_id = public.family_patient_id());
drop policy if exists "overrides insert" on public.supervisor_overrides;
create policy "overrides insert" on public.supervisor_overrides
  for insert with check (
    (public.is_supervisor() and supervisor_user_id = auth.uid())
    or public.is_admin()
  );

-- ============================================================================
-- Sanitized family timeline view (used by /api/family/timeline)
-- Excludes medication detail per default; pulls visit log + ratings + alerts (anon).
-- ============================================================================
create or replace view public.family_visit_timeline as
  select
    vc.id as visit_id,
    vc.patient_id,
    vc.occurred_at,
    u.full_name as nurse_name,
    n.wf_id as nurse_wf_id,
    v.blood_pressure_systolic, v.blood_pressure_diastolic,
    v.temperature_c, v.heart_rate_bpm, v.oxygen_pct,
    vr.rating, vr.comment, vr.is_advisory
  from public.visit_confirmations vc
  left join public.users u on u.id = vc.nurse_user_id
  left join public.nurses n on n.user_id = vc.nurse_user_id
  left join public.patient_rounds pr on pr.visit_confirmation_id = vc.id
  left join public.vitals v on v.id = pr.vitals_id
  left join public.visit_ratings vr on vr.visit_confirmation_id = vc.id;
-- Views inherit RLS from underlying tables when invoked under the GUC family_patient_id.
