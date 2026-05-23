// POST /api/doctor/proposals — propose a doctor for a patient. The proposal
// is pending until /confirm is called.
//
// Reason is REQUIRED: every doctor assignment must have a documented reason
// in the audit trail. For the top-ranked auto-suggestion the ER UI fills
// "Auto-suggested for {chief_complaint}". For an override (non-top doctor),
// the UI prompts the ER admin for the override reason.
//
// origin:
//   'er'         — ER staff
//   'doctor_self'— the target doctor proposes themselves
//   'next_of_kin'— authenticated NOK session
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  target_doctor_id: z.string().uuid(),
  origin: z.enum(['er', 'doctor_self', 'next_of_kin']),
  intake_id: z.string().uuid().optional(),
  rank_score: z.number().optional(),
  reason: z.string().min(3).max(2000),
  is_override: z.boolean().optional(),
  expires_in_minutes: z.number().int().min(5).max(720).default(60),
});

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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

  if (
    parsed.data.origin === 'doctor_self' &&
    session.user_id !== parsed.data.target_doctor_id
  ) {
    return NextResponse.json({ error: 'self_propose_mismatch' }, { status: 403 });
  }

  const svc = createSupabaseServiceClient();
  const reasonText = parsed.data.is_override
    ? `[override] ${parsed.data.reason}`
    : parsed.data.reason;

  const { data: ins, error: insErr } = await svc
    .from('doctor_proposals')
    .insert({
      patient_id: parsed.data.patient_id,
      target_doctor_id: parsed.data.target_doctor_id,
      proposed_by: session.user_id,
      origin: parsed.data.origin,
      intake_id: parsed.data.intake_id ?? null,
      rank_score: parsed.data.rank_score ?? null,
      reason: reasonText,
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
    action: parsed.data.is_override ? 'doctor.override' : 'doctor.propose',
    entity_type: 'doctor_proposals',
    entity_id: ins.id,
    after: {
      origin: parsed.data.origin,
      patient_id: parsed.data.patient_id,
      target_doctor_id: parsed.data.target_doctor_id,
      is_override: !!parsed.data.is_override,
      reason: reasonText,
    },
  });

  return NextResponse.json({
    ok: true,
    proposal_id: ins.id,
    expires_at: ins.expires_at,
  });
}
