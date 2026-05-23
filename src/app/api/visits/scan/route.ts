// POST /api/visits/scan — bedside visit witness via wristband QR (primary) or
// fingerprint fallback. Cookie-auth (wf_nurse). Writes visit_confirmations with
// method='wristband_scan' or 'patient_fingerprint'.
//
// Body:
//   { token: string } — wristband path (primary)
// OR
//   { patient_id: uuid, method: 'patient_fingerprint', signature_payload?, ... } — fallback
//
// Both paths share the same downstream side-effects (mark scheduled visit
// confirmed, close alerts, touch nurse last_seen).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const BodySchema = z.union([
  z.object({
    mode: z.literal('wristband').default('wristband'),
    token: z.string().min(8).max(64),
    scheduled_visit_id: z.string().uuid().optional(),
    device_id: z.string().max(120).optional(),
    client_seq: z.number().int().optional(),
    client_nonce: z.string().max(64).optional(),
    offline_queued: z.boolean().optional(),
  }),
  z.object({
    mode: z.literal('fingerprint_fallback'),
    patient_id: z.string().uuid(),
    signature_payload: z.record(z.unknown()).optional(),
    scheduled_visit_id: z.string().uuid().optional(),
    device_id: z.string().max(120).optional(),
    client_seq: z.number().int().optional(),
    client_nonce: z.string().max(64).optional(),
    offline_queued: z.boolean().optional(),
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
  let signaturePayload: Record<string, unknown> | null = null;

  if (v.mode === 'wristband' || v.mode === undefined) {
    // Primary path: resolve token → patient_id
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
    // Fallback: fingerprint
    patientId = v.patient_id;
    method = 'patient_fingerprint';
    signaturePayload = v.signature_payload ?? null;
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
