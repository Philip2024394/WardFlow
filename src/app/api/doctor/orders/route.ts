// POST /api/doctor/orders — doctor adds a medication / treatment note / photo or video request / vitals request.
// Immutable. Supersede via PATCH (creates a new row and links via supersede_doctor_order RPC).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  kind: z.enum(['medication', 'treatment_note', 'photo_request', 'video_request', 'vitals_request']),
  origin: z.enum(['bedside_fingerprint', 'remote_authenticated']).default('remote_authenticated'),
  drug_name: z.string().max(120).optional(),
  dose: z.string().max(60).optional(),
  route: z.string().max(40).optional(),
  schedule_cron: z.string().max(60).optional(),
  duration: z.string().max(60).optional(),
  body: z.string().max(4000).optional(),
  supersedes_id: z.string().uuid().optional(),
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
  if (parsed.data.kind === 'medication' && (!parsed.data.drug_name || !parsed.data.dose)) {
    return NextResponse.json(
      { error: 'medication_requires_drug_and_dose' },
      { status: 400 },
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const svc = createSupabaseServiceClient();
    const { data: ins, error: insErr } = await svc
      .from('doctor_orders')
      .insert({
        patient_id: parsed.data.patient_id,
        doctor_user_id: user.id,
        kind: parsed.data.kind,
        origin: parsed.data.origin,
        drug_name: parsed.data.drug_name ?? null,
        dose: parsed.data.dose ?? null,
        route: parsed.data.route ?? null,
        schedule_cron: parsed.data.schedule_cron ?? null,
        duration: parsed.data.duration ?? null,
        body: parsed.data.body ?? null,
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    if (parsed.data.supersedes_id) {
      await svc.rpc('supersede_doctor_order', { p_id: parsed.data.supersedes_id, p_new_id: ins.id });
    }

    await logAuditEvent({
      action: 'doctor.order.create',
      entity_type: 'doctor_orders',
      entity_id: ins.id,
      after: { kind: parsed.data.kind, patient_id: parsed.data.patient_id },
    });

    return NextResponse.json({ ok: true, order_id: ins.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
