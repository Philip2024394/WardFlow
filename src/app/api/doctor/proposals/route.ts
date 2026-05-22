// POST /api/doctor/proposals — anyone (ER staff, doctor self, patient, NOK) proposes a doctor.
// The proposal is pending until /confirm is called.
//
// origin determines auth checks:
//   'er'         — ER staff / reception / supervisor / admin
//   'doctor_self'— the target doctor proposes themselves
//   'patient'    — handled via a separate endpoint /api/doctor/proposals/by-patient
//                  (bedside tablet, no Supabase session — uses service client)
//   'next_of_kin'— authenticated NOK session
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  target_doctor_id: z.string().uuid(),
  origin: z.enum(['er', 'doctor_self', 'next_of_kin']),
  intake_id: z.string().uuid().optional(),
  rank_score: z.number().optional(),
  reason: z.string().max(2000).optional(),
  expires_in_minutes: z.number().int().min(5).max(720).default(60),
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

    // doctor_self origin requires proposed_by == target_doctor_id
    if (parsed.data.origin === 'doctor_self' && user.id !== parsed.data.target_doctor_id) {
      return NextResponse.json({ error: 'self_propose_mismatch' }, { status: 403 });
    }

    const svc = createSupabaseServiceClient();
    const { data: ins, error: insErr } = await svc
      .from('doctor_proposals')
      .insert({
        patient_id: parsed.data.patient_id,
        target_doctor_id: parsed.data.target_doctor_id,
        proposed_by: user.id,
        origin: parsed.data.origin,
        intake_id: parsed.data.intake_id ?? null,
        rank_score: parsed.data.rank_score ?? null,
        reason: parsed.data.reason ?? null,
        status: 'pending',
        expires_at: new Date(
          Date.now() + parsed.data.expires_in_minutes * 60_000,
        ).toISOString(),
      })
      .select('id,expires_at')
      .single();
    if (insErr || !ins) {
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    await logAuditEvent({
      action: 'doctor.propose',
      entity_type: 'doctor_proposals',
      entity_id: ins.id,
      after: {
        origin: parsed.data.origin,
        patient_id: parsed.data.patient_id,
        target_doctor_id: parsed.data.target_doctor_id,
      },
    });

    return NextResponse.json({ ok: true, proposal_id: ins.id, expires_at: ins.expires_at });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
