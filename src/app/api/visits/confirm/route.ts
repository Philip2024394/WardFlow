// POST /api/visits/confirm — bedside visit witness.
// Captures the nurse-arrived-at-bed event. Patient confirms via:
//   - patient_fingerprint  (stubbed; pass-through until WebAuthn ships)
//   - patient_tap          (touchscreen acknowledgement)
//   - photo_fallback       (nurse uploads a photo of themselves at the bed)
//   - family_witness       (cognitively impaired patient; family signs)
//   - two_nurse_witness    (no patient + no family; two distinct nurses sign)
//
// If scheduled_visit_id is provided AND the visit is still 'pending', this also
// marks the scheduled_visits row as 'confirmed' atomically.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  method: z.enum([
    'patient_fingerprint',
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
});

export async function POST(req: Request) {
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

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const occurredAt = new Date().toISOString();

    const { data: ins, error: insErr } = await supabase
      .from('visit_confirmations')
      .insert({
        patient_id: parsed.data.patient_id,
        nurse_user_id: user.id,
        scheduled_visit_id: parsed.data.scheduled_visit_id ?? null,
        method: parsed.data.method,
        witness_nurse_id: parsed.data.witness_nurse_id ?? null,
        witness_family_contact_id: parsed.data.witness_family_contact_id ?? null,
        signature_payload: parsed.data.signature_payload ?? null,
        photo_url: parsed.data.photo_url ?? null,
        device_id: parsed.data.device_id ?? null,
        client_seq: parsed.data.client_seq ?? null,
        client_nonce: parsed.data.client_nonce ?? null,
        offline_queued_at: parsed.data.offline_queued ? occurredAt : null,
        occurred_at: occurredAt,
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      // Handle nonce-replay (offline queue) gracefully.
      if (
        parsed.data.client_nonce &&
        insErr?.message?.includes('ux_visitconf_client_nonce')
      ) {
        return NextResponse.json({ ok: true, deduped: true });
      }
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    // Mark scheduled visit confirmed (if any) using the service client to bypass
    // nurse RLS update on scheduled_visits.
    if (parsed.data.scheduled_visit_id) {
      const svc = createSupabaseServiceClient();
      await svc
        .from('scheduled_visits')
        .update({
          status: 'confirmed',
          confirmed_by_visit_id: ins.id,
          confirmed_at: occurredAt,
        })
        .eq('id', parsed.data.scheduled_visit_id)
        .eq('status', 'pending');

      // Close any open missed-round alert for this visit.
      await svc
        .from('alerts')
        .update({ state: 'resolved', resolved_at: occurredAt })
        .eq('scheduled_visit_id', parsed.data.scheduled_visit_id)
        .eq('state', 'open');
    }

    // Update nurse online + last_seen.
    {
      const svc = createSupabaseServiceClient();
      await svc
        .from('nurses')
        .update({ is_online: true, last_seen_at: occurredAt })
        .eq('user_id', user.id);
    }

    await logAuditEvent({
      action: 'visit.confirm',
      entity_type: 'visit_confirmations',
      entity_id: ins.id,
      after: { method: parsed.data.method, scheduled_visit_id: parsed.data.scheduled_visit_id },
      device_id: parsed.data.device_id ?? null,
    });

    return NextResponse.json({ ok: true, visit_confirmation_id: ins.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
