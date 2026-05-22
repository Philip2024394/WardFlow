-- WardFlow Phase 0 — audit_logs immutability.
-- Permenkes 24/2022 (Rekam Medis Elektronik) requires medical-record audit trails
-- be tamper-evident. INSERT-only is the simplest guarantee. Supervisors and admins
-- can SELECT (policy in 0002), but nobody — not even service_role via the SQL editor —
-- can UPDATE or DELETE without first dropping this trigger.

create or replace function public.prevent_audit_modify()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is INSERT-ONLY (immutable for Permenkes 24/2022 compliance)';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_modify();

-- Same guarantee for the family-portal access log.
drop trigger if exists family_access_log_immutable on public.family_access_log;
create trigger family_access_log_immutable
  before update or delete on public.family_access_log
  for each row execute function public.prevent_audit_modify();

comment on table public.audit_logs is
  'INSERT-ONLY. Enforced by prevent_audit_modify() trigger. Do not drop this trigger without compliance review.';
comment on table public.family_access_log is
  'INSERT-ONLY. Enforced by prevent_audit_modify() trigger. Records every family-portal session.';
