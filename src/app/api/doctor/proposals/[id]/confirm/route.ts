// POST /api/doctor/proposals/[id]/confirm — ER staff, patient, or next-of-kin confirms a
// doctor proposal. Writes an immutable doctor_assignment_acceptances row, then writes an
// immutable doctor_assignments row, supersedes any prior active assignment.
//
// Acceptance authority hierarchy (highest wins via supersedence):
//   conscious-alert patient > next-of-kin > ER staff
//   two_physician_witness is used for emergency exception (unconscious patient, no NOK)
//
// Body:
//   { actor: 'er_staff'|'patient'|'next_of_kin'|'two_physician_witness',
//     method: 'patient_fingerprint'|'patient_tap'|'family_witness'|'two_nurse_witness',
//     two_physician_witness_id?: uuid,           // required if actor='two_physician_witness'
//     family_contact_id?: uuid,                  // required if actor='next_of_kin'
//     emergency_exception?: boolean,
//     signature_payload?: any }
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  actor: z.enum(['er_staff', 'patient', 'next_of_kin', 'two_physician_witness']),
  method: z.enum([
    'patient_fingerprint',
    'patient_tap',
    'photo_fallback',
    'family_witness',
    'two_nurse_witness',
  ]),
  two_physician_witness_id: z.string().uuid().optional(),
  family_contact_id: z.string().uuid().optional(),
  emergency_exception: z.boolean().default(false),
  signature_payload: z.record(z.unknown()).optional(),
});

const ACTOR_AUTHORITY: Record<z.infer<typeof Schema>['actor'], number> = {
  two_physician_witness: 1,
  er_staff: 2,
  next_of_kin: 3,
  patient: 4, // highest — conscious patient overrides
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: proposalId } = await ctx.params;
  if (!proposalId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
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
  if (parsed.data.emergency_exception && !parsed.data.two_physician_witness_id) {
    return NextResponse.json(
      { error: 'emergency_requires_witness' },
      { status: 400 },
    );
  }
  if (parsed.data.actor === 'next_of_kin' && !parsed.data.family_contact_id) {
    return NextResponse.json(
      { error: 'nok_requires_family_contact_id' },
      { status: 400 },
    );
  }

  try {
    const svc = createSupabaseServiceClient();
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: prop } = await svc
      .from('doctor_proposals')
      .select('id,patient_id,target_doctor_id,intake_id,status,expires_at')
      .eq('id', proposalId)
      .maybeSingle();
    if (!prop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (prop.status !== 'pending')
      return NextResponse.json({ error: 'not_pending', state: prop.status }, { status: 409 });
    if (new Date(prop.expires_at).getTime() < Date.now())
      return NextResponse.json({ error: 'expired' }, { status: 409 });

    // Look for any existing acceptance for this proposal (acts as authority comparator).
    const { data: existing } = await svc
      .from('doctor_assignment_acceptances')
      .select('id,actor,superseded_at')
      .eq('proposal_id', prop.id)
      .is('superseded_at', null)
      .maybeSingle();

    const nowIso = new Date().toISOString();

    // Insert acceptance
    const { data: acc, error: accErr } = await svc
      .from('doctor_assignment_acceptances')
      .insert({
        proposal_id: prop.id,
        patient_id: prop.patient_id,
        doctor_user_id: prop.target_doctor_id,
        actor: parsed.data.actor,
        actor_user_id: user?.id ?? null,
        actor_family_contact_id: parsed.data.family_contact_id ?? null,
        method: parsed.data.method,
        signature_payload: parsed.data.signature_payload ?? null,
        emergency_exception: parsed.data.emergency_exception,
        two_physician_witness_id: parsed.data.two_physician_witness_id ?? null,
      })
      .select('id')
      .single();
    if (accErr || !acc) {
      return NextResponse.json(
        { error: 'acceptance_insert_failed', detail: accErr?.message },
        { status: 500 },
      );
    }

    // Supersede prior acceptance only if new actor has higher authority.
    if (existing) {
      const priorAuthority = ACTOR_AUTHORITY[existing.actor as keyof typeof ACTOR_AUTHORITY] ?? 0;
      const newAuthority = ACTOR_AUTHORITY[parsed.data.actor];
      if (newAuthority > priorAuthority) {
        await svc.rpc('supersede_doctor_acceptance', { p_id: existing.id, p_new_id: acc.id });
      }
    }

    // Find prior active doctor_assignment and supersede it.
    const { data: priorAssign } = await svc
      .from('doctor_assignments')
      .select('id')
      .eq('patient_id', prop.patient_id)
      .is('superseded_at', null)
      .maybeSingle();

    const { data: newAssign, error: aErr } = await svc
      .from('doctor_assignments')
      .insert({
        patient_id: prop.patient_id,
        doctor_user_id: prop.target_doctor_id,
        origin: parsed.data.method === 'patient_fingerprint'
          ? 'bedside_fingerprint'
          : 'remote_authenticated',
        er_intake_id: prop.intake_id,
        acceptance_id: acc.id,
        emergency_exception: parsed.data.emergency_exception,
        two_physician_witness_id: parsed.data.two_physician_witness_id ?? null,
      })
      .select('id')
      .single();
    if (aErr || !newAssign) {
      return NextResponse.json(
        { error: 'assign_insert_failed', detail: aErr?.message },
        { status: 500 },
      );
    }
    if (priorAssign) {
      await svc.rpc('supersede_doctor_assignment', { p_id: priorAssign.id, p_new_id: newAssign.id });
    }

    // Flip proposal status
    await svc
      .from('doctor_proposals')
      .update({ status: 'confirmed', resolved_at: nowIso, resolved_by: user?.id ?? null })
      .eq('id', prop.id);

    // Mirror onto patients table
    await svc
      .from('patients')
      .update({ assigned_doctor_id: prop.target_doctor_id })
      .eq('id', prop.patient_id);

    // doctors.current_patient_count is recomputed by a periodic job, not bumped here,
    // to avoid race conditions on rapid proposal/supersede sequences.

    await logAuditEvent({
      action: 'doctor.assign.confirm',
      entity_type: 'doctor_assignments',
      entity_id: newAssign.id,
      after: {
        proposal_id: prop.id,
        patient_id: prop.patient_id,
        doctor_user_id: prop.target_doctor_id,
        actor: parsed.data.actor,
        method: parsed.data.method,
        emergency_exception: parsed.data.emergency_exception,
      },
    });

    return NextResponse.json({
      ok: true,
      acceptance_id: acc.id,
      assignment_id: newAssign.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
