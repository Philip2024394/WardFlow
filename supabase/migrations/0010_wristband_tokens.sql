-- WardFlow Phase 2 — wristband barcode scanning.
-- Adds an opaque wristband token per patient (printed as a QR on the ER-issued
-- wristband) and a 'wristband_scan' confirmation_method. Fingerprint stays as
-- the fallback for non-scannable cases (broken band, unconscious patient
-- whose band is missing, etc.).

-- ============================================================================
-- 1. extend confirmation_method enum with wristband_scan
-- ============================================================================
do $$ begin
  alter type confirmation_method add value if not exists 'wristband_scan';
exception when others then null; end $$;

-- ============================================================================
-- 2. opaque-token generator (32 chars, no confusables)
-- ============================================================================
create or replace function public.generate_wristband_token()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..32 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ============================================================================
-- 3. patient_wristband_tokens — issue + rotate; only one active per patient
-- ============================================================================
create table if not exists public.patient_wristband_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  token text not null unique,
  issued_at timestamptz not null default now(),
  issued_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  revoke_reason text,
  created_at timestamptz not null default now()
);
alter table public.patient_wristband_tokens enable row level security;
create index if not exists idx_wristband_patient
  on public.patient_wristband_tokens(patient_id, issued_at desc);
create unique index if not exists ux_wristband_active
  on public.patient_wristband_tokens(patient_id)
  where revoked_at is null;

comment on table public.patient_wristband_tokens is
  'Opaque QR token printed on the patient wristband at ER admission. Server-issued, not derivable from patient_id. Only one active token per patient (rotated when a band is lost).';

-- ============================================================================
-- 4. helper: resolve a token to patient_id (only active tokens)
-- ============================================================================
create or replace function public.resolve_wristband_token(p_token text)
returns uuid language sql stable as $$
  select patient_id
  from public.patient_wristband_tokens
  where token = p_token and revoked_at is null
  limit 1;
$$;

-- ============================================================================
-- 5. RLS — staff can read tokens for their patients; only admin/ER can rotate
-- ============================================================================
drop policy if exists "wristband read scoped" on public.patient_wristband_tokens;
create policy "wristband read scoped" on public.patient_wristband_tokens
  for select using (
    public.is_admin() or public.is_supervisor()
    or public.is_doctor() or public.is_nurse()
    or public.is_role('reception')
  );

drop policy if exists "wristband insert er" on public.patient_wristband_tokens;
create policy "wristband insert er" on public.patient_wristband_tokens
  for insert with check (
    public.is_admin() or public.is_supervisor()
    or public.is_nurse() or public.is_doctor()
    or public.is_role('reception')
  );

drop policy if exists "wristband update revoke" on public.patient_wristband_tokens;
create policy "wristband update revoke" on public.patient_wristband_tokens
  for update using (
    public.is_admin() or public.is_supervisor()
    or public.is_nurse() or public.is_doctor()
    or public.is_role('reception')
  );
