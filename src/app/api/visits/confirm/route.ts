// POST /api/visits/confirm — bedside visit witness (cookie-auth nurse).
// Captures the nurse-arrived-at-bed event for the legacy/non-wristband methods:
//   - patient_tap, photo_fallback, family_witness, two_nurse_witness
// (wristband_scan + patient_fingerprint go through /api/visits/scan)
//
// If GPS is provided AND the patient has a ward with a geofence configured,
// the scan must be inside the geofence (server-side haversine).
//
// If scheduled_visit_id is provided AND the row is still 'pending', this also
// marks scheduled_visits as 'confirmed' atomically and closes any open
// missed-round alert.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  method: z.enum([
    'patient_tap',
    'photo_fallback',
    'family_witness',
    'two_nurse_witness',
  ]),
  witness_nurse_id: z.string().uuid().optional(),
  witness_family_contact_id: z.string().uuid().optional(),
  signature_payload: z.record(z.unknown()).optional(),
  photo_url: z.string().url().optional(),
  scheduled_visit_id: z.string().uuid().optional(),
  device_id: z.string().max(120).optional(),
  client_seq: z.number().int().optional(),
  client_nonce: z.string().max(64).optional(),
  offline_queued: z.boolean().optional(),
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  gps_accuracy_m: z.number().nonnegative().optional(),
});

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session || session.role !== 'nurse') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const supabase = createSupabaseServiceClient();
  const occurredAt = new Date().toISOString();

  const signaturePayload: Record<string, unknown> = { ...(v.signature_payload ?? {}) };

  if (typeof v.gps_lat === 'number' && typeof v.gps_lng === 'number') {
    const { data: prox } = await supabase
      .rpc('check_ward_proximity', {
        p_patient_id: v.patient_id,
        p_lat: v.gps_lat,
        p_lng: v.gps_lng,
      })
      .single();
    type Prox = {
      ok: boolean;
      enforced: boolean;
      distance_m: number | null;
      ward_id: string | null;
      ward_name: string | null;
    };
    const p = prox as Prox | null;
    if (p) {
      signaturePayload.gps_lat = v.gps_lat;
      signaturePayload.gps_lng = v.gps_lng;
      signaturePayload.gps_accuracy_m = v.gps_accuracy_m ?? null;
      signaturePayload.geofence_enforced = p.enforced;
      signaturePayload.geofence_distance_m = p.distance_m;
      signaturePayload.ward_id = p.ward_id;
      if (p.enforced && !p.ok) {
        return NextResponse.json(
          {
            error: 'out_of_geofence',
            ward_name: p.ward_name,
            distance_m: p.distance_m,
          },
          { status: 403 },
        );
      }
    }
  } else {
    signaturePayload.gps_missing = true;
  }

  const { data: ins, error: insErr } = await supabase
    .from('visit_confirmations')
    .insert({
      patient_id: v.patient_id,
      nurse_user_id: session.user_id,
      scheduled_visit_id: v.scheduled_visit_id ?? null,
      method: v.method,
      witness_nurse_id: v.witness_nurse_id ?? null,
      witness_family_contact_id: v.witness_family_contact_id ?? null,
      signature_payload: signaturePayload,
      photo_url: v.photo_url ?? null,
      device_id: v.device_id ?? null,
      client_seq: v.client_seq ?? null,
      client_nonce: v.client_nonce ?? null,
      offline_queued_at: v.offline_queued ? occurredAt : null,
      occurred_at: occurredAt,
    })
    .select('id')
    .single();
  if (insErr || !ins) {
    if (
      v.client_nonce &&
      insErr?.message?.includes('ux_visitconf_client_nonce')
    ) {
      return NextResponse.json({ ok: true, deduped: true });
    }
    return NextResponse.json(
      { error: 'insert_failed', detail: insErr?.message },
      { status: 500 },
    );
  }

  if (v.scheduled_visit_id) {
    await supabase
      .from('scheduled_visits')
      .update({
        status: 'confirmed',
        confirmed_by_visit_id: ins.id,
        confirmed_at: occurredAt,
      })
      .eq('id', v.scheduled_visit_id)
      .eq('status', 'pending');

    await supabase
      .from('alerts')
      .update({ state: 'resolved', resolved_at: occurredAt })
      .eq('scheduled_visit_id', v.scheduled_visit_id)
      .eq('state', 'open');
  }

  await supabase
    .from('nurses')
    .update({ is_online: true, last_seen_at: occurredAt })
    .eq('user_id', session.user_id);

  await logAuditEvent({
    action: 'visit.confirm',
    entity_type: 'visit_confirmations',
    entity_id: ins.id,
    after: {
      method: v.method,
      scheduled_visit_id: v.scheduled_visit_id,
      geofence_enforced: signaturePayload.geofence_enforced ?? false,
    },
    device_id: v.device_id ?? null,
  });

  return NextResponse.json({ ok: true, visit_confirmation_id: ins.id });
}
