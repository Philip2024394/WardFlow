-- WardFlow Phase 2 — ward GPS geofence for visit-confirmation presence check.
-- Each ward optionally stores a GPS centre + radius. When a nurse scans a
-- patient who is currently assigned to a ward with GPS configured, the scan
-- location must fall inside the ward's geofence. ER patients (no ward_id yet)
-- skip the check so initial ER scans aren't blocked.

alter table public.wards
  add column if not exists gps_lat numeric(10, 7),
  add column if not exists gps_lng numeric(10, 7),
  add column if not exists gps_radius_m integer
    check (gps_radius_m is null or (gps_radius_m between 5 and 5000));

comment on column public.wards.gps_lat is
  'Centre of the ward GPS geofence (WGS84). NULL = geofence not configured for this ward.';
comment on column public.wards.gps_lng is
  'Centre of the ward GPS geofence (WGS84).';
comment on column public.wards.gps_radius_m is
  'Radius in metres for the ward geofence. Recommended: building footprint + 5–10m buffer.';

-- ============================================================================
-- haversine distance in metres (WGS84 sphere approximation, ~0.5% accurate)
-- ============================================================================
create or replace function public.haversine_meters(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric language plpgsql immutable as $$
declare
  r constant numeric := 6371000;
  phi1 numeric := radians(lat1);
  phi2 numeric := radians(lat2);
  dphi numeric := radians(lat2 - lat1);
  dlmb numeric := radians(lng2 - lng1);
  a numeric;
  c numeric;
begin
  a := sin(dphi / 2) ^ 2 + cos(phi1) * cos(phi2) * sin(dlmb / 2) ^ 2;
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  return r * c;
end;
$$;

-- ============================================================================
-- check_ward_proximity — for a patient + a GPS reading, returns whether the
-- reading is inside the ward's geofence. If the patient has no ward_id, or
-- the ward has no GPS configured, the check is not enforced (ok=true,
-- enforced=false) so initial ER scans + un-configured wards still work.
-- ============================================================================
create or replace function public.check_ward_proximity(
  p_patient_id uuid, p_lat numeric, p_lng numeric
) returns table (
  ok boolean,
  enforced boolean,
  distance_m integer,
  ward_id uuid,
  ward_name text
) language plpgsql stable as $$
declare
  p_ward_id uuid;
  w_lat numeric;
  w_lng numeric;
  w_r integer;
  w_name text;
  d numeric;
begin
  select ward_id into p_ward_id from public.patients where id = p_patient_id;
  if p_ward_id is null then
    return query select true, false, null::integer, null::uuid, null::text;
    return;
  end if;

  select gps_lat, gps_lng, gps_radius_m, name
    into w_lat, w_lng, w_r, w_name
    from public.wards where id = p_ward_id;
  if w_lat is null or w_lng is null or w_r is null then
    return query select true, false, null::integer, p_ward_id, w_name;
    return;
  end if;

  d := public.haversine_meters(p_lat, p_lng, w_lat, w_lng);
  return query select
    (d <= w_r),
    true,
    round(d)::integer,
    p_ward_id,
    w_name;
end;
$$;
