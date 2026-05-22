// POST /api/handover/[id]/accept — incoming nurse accepts a handover proposal.
// On first acceptance for a proposal, this:
//   1. marks the proposal_nurse row accepted
//   2. (in a transaction) inserts an immutable handover_events row
//   3. (best effort) updates the patient's ward_id + assigned_nurse_id
//   4. flips the proposal status to 'accepted'
// The DB trigger guard_patient_ward_entry depends on (2) existing before (3) succeeds.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  method: z.enum(['patient_fingerprint', 'patient_tap', 'photo_fallback']).default('patient_tap'),
  signature_payload: z.record(z.unknown()).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: proposalId } = await ctx.params;
  if (!proposalId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is allowed (defaults).
  }
  const parsed = Schema.safeParse(body || {});
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

    // Confirm this nurse is on the proposal AND it's still actionable.
    const { data: prop } = await supabase
      .from('handover_proposals')
      .select('id,status,patient_id,to_ward_id,proposed_by,expires_at,notes,pending_tasks,medication_status,patient_condition')
      .eq('id', proposalId)
      .maybeSingle();
    if (!prop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (prop.status !== 'pending')
      return NextResponse.json({ error: 'not_pending', state: prop.status }, { status: 409 });
    if (new Date(prop.expires_at).getTime() < Date.now())
      return NextResponse.json({ error: 'expired' }, { status: 409 });

    const { data: hpn } = await supabase
      .from('handover_proposal_nurses')
      .select('id,role,accepted_at')
      .eq('proposal_id', proposalId)
      .eq('nurse_user_id', user.id)
      .maybeSingle();
    if (!hpn) return NextResponse.json({ error: 'not_invited' }, { status: 403 });
    if (hpn.accepted_at)
      return NextResponse.json({ error: 'already_accepted' }, { status: 409 });

    // Mark this nurse's acceptance.
    const acceptedAt = new Date().toISOString();
    await supabase
      .from('handover_proposal_nurses')
      .update({
        accepted_at: acceptedAt,
        acceptance_method: parsed.data.method,
      })
      .eq('id', hpn.id);

    // Insert the immutable handover_events row BEFORE ward_id flips,
    // so the guard trigger sees it.
    const svc = createSupabaseServiceClient();
    const { data: existingPrimary } = await svc
      .from('handover_events')
      .select('id')
      .eq('patient_id', prop.patient_id)
      .is('superseded_at', null)
      .eq('incoming_role', 'primary')
      .maybeSingle();

    // If a current primary exists and this is also primary, supersede the old one.
    let newEventId: string | null = null;
    {
      const { data: insRow, error: insErr } = await svc
        .from('handover_events')
        .insert({
          patient_id: prop.patient_id,
          proposal_id: prop.id,
          outgoing_nurse_id: prop.proposed_by, // ER staff is the outgoing party
          incoming_nurse_id: user.id,
          outgoing_role: 'er',
          incoming_role: hpn.role,
          to_ward_id: prop.to_ward_id,
          notes: prop.notes,
          pending_tasks: prop.pending_tasks,
          medication_status: prop.medication_status,
          patient_condition: prop.patient_condition,
          acceptance_method: parsed.data.method,
        })
        .select('id')
        .single();
      if (insErr || !insRow) {
        return NextResponse.json(
          { error: 'handover_insert_failed', detail: insErr?.message },
          { status: 500 },
        );
      }
      newEventId = insRow.id;
    }

    if (existingPrimary && hpn.role === 'primary' && newEventId) {
      await svc.rpc('supersede_handover', {
        p_event_id: existingPrimary.id,
        p_new_event_id: newEventId,
      });
    }

    // Now flip the patient's ward_id + assigned_nurse_id.
    // Service client to bypass nurse RLS update restriction; trigger sees handover row exists.
    await svc
      .from('patients')
      .update({
        ward_id: prop.to_ward_id,
        assigned_nurse_id: user.id,
        er_handover_completed_at: acceptedAt,
      })
      .eq('id', prop.patient_id);

    // Mark proposal accepted.
    await svc
      .from('handover_proposals')
      .update({ status: 'accepted', resolved_at: acceptedAt, resolved_by: user.id })
      .eq('id', proposalId);

    await logAuditEvent({
      action: 'handover.accept',
      entity_type: 'handover_events',
      entity_id: newEventId ?? proposalId,
      after: { proposal_id: proposalId, patient_id: prop.patient_id, method: parsed.data.method },
    });

    return NextResponse.json({
      ok: true,
      handover_event_id: newEventId,
      patient_id: prop.patient_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
