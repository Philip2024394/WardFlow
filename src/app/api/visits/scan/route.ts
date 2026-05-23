// POST /api/visits/scan — bedside visit witness via wristband QR (primary) or
// fingerprint fallback. Cookie-auth (wf_nurse).
//
// Body:
//   { mode: 'wristband', token, gps_lat?, gps_lng?, gps_accuracy_m? }
//   { mode: 'fingerprint_fallback', patient_id, gps_lat?, gps_lng?, gps_accuracy_m?,
//     signature_payload? }
//
// If the patient is currently assigned to a ward that has GPS configured, the
// scan's GPS must fall inside the geofence (haversine, server-side). ER
// patients (no ward_id) and wards with no GPS skip the check.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const Common = {
  gps_lat: z.number().min(-90).max(90).optional(),
  gps_lng: z.number().min(-180).max(180).optional(),
  gps_accuracy_m: z.number().nonnegative().optional(),
  scheduled_visit_id: z.string().uuid().optional(),
  device_id: z.string().max(120).optional(),
  client_seq: z.number().int().optional(),
  client_nonce: z.string().max(64).optional(),
  offline_queued: z.boolean().optional(),
};

const BodySchema = z.union([
  z.object({
    mode: z.literal('wristband').default('wristband'),
    token: z.string().min(8).max(64),
    ...Common,
  }),
  z.object({
    mode: z.literal('fingerprint_fallback'),
    patient_id: z.string().uuid(),
    signature_payload: z.record(z.unknown()).optional(),
    ...Common,
  }),
]);

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
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const supabase = createSupabaseServiceClient();
  const occurredAt = new Date().toISOString();

  let patientId: string;
  let method: 'wristband_scan' | 'patient_fingerprint';
  let signaturePayload: Record<string, unknown> = {};

  if (v.mode === 'wristband' || v.mode === undefined) {
    const { data: resolved, error: resErr } = await supabase
      .rpc('resolve_wristband_token', { p_token: v.token })
      .single();
    if (resErr || !resolved) {
      return NextResponse.json({ error: 'unknown_token' }, { status: 404 });
    }
    patientId = resolved as unknown as string;
    method = 'wristband_scan';
    signaturePayload = { token_tail: v.token.slice(-6) };
  } else {
    patientId = v.patient_id;
    method = 'patient_fingerprint';
    signaturePayload = v.signature_payload ?? {};
  }

  if (typeof v.gps_lat === 'number' && typeof v.gps_lng === 'number') {
    const { data: prox } = await supabase
      .rpc('check_ward_proximity', {
        p_patient_id: patientId,
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
      patient_id: patientId,
      nurse_user_id: session.user_id,
      scheduled_visit_id: v.scheduled_visit_id ?? null,
      method,
      signature_payload: signaturePayload,
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

  return NextResponse.json({
    ok: true,
    visit_confirmation_id: ins.id,
    patient_id: patientId,
    method,
  });
}
