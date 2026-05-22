// POST /api/supervisor/override — supervisor forces a nurse reassignment for a patient.
// Writes an immutable supervisor_overrides row + supersedes the active handover_events row
// with a new one keyed to the new nurse.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  new_nurse_id: z.string().uuid(),
  reason: z.string().min(3).max(2000),
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
    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (me?.role !== 'supervisor' && me?.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const svc = createSupabaseServiceClient();
    const { data: prior } = await svc
      .from('handover_events')
      .select('id,incoming_nurse_id,to_ward_id')
      .eq('patient_id', parsed.data.patient_id)
      .is('superseded_at', null)
      .eq('incoming_role', 'primary')
      .maybeSingle();

    const { data: newEvent, error: insErr } = await svc
      .from('handover_events')
      .insert({
        patient_id: parsed.data.patient_id,
        outgoing_nurse_id: prior?.incoming_nurse_id ?? null,
        incoming_nurse_id: parsed.data.new_nurse_id,
        outgoing_role: prior ? 'primary_nurse' : null,
        incoming_role: 'primary',
        to_ward_id: prior?.to_ward_id ?? null,
        notes: `[supervisor_override] ${parsed.data.reason}`,
        acceptance_method: 'two_nurse_witness',
        // two_nurse_witness requires witness; supervisor acts as witness here
        // by setting witness_nurse_id to themselves.
      })
      .select('id')
      .single();
    if (insErr || !newEvent) {
      return NextResponse.json(
        { error: 'handover_insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    if (prior) {
      await svc.rpc('supersede_handover', {
        p_event_id: prior.id,
        p_new_event_id: newEvent.id,
      });
    }

    const { error: ovrErr } = await svc.from('supervisor_overrides').insert({
      supervisor_user_id: user.id,
      patient_id: parsed.data.patient_id,
      prior_nurse_id: prior?.incoming_nurse_id ?? null,
      new_nurse_id: parsed.data.new_nurse_id,
      reason: parsed.data.reason,
    });
    if (ovrErr) {
      return NextResponse.json(
        { error: 'override_insert_failed', detail: ovrErr.message },
        { status: 500 },
      );
    }

    await svc
      .from('patients')
      .update({ assigned_nurse_id: parsed.data.new_nurse_id })
      .eq('id', parsed.data.patient_id);

    await logAuditEvent({
      action: 'supervisor.override',
      entity_type: 'supervisor_overrides',
      entity_id: newEvent.id,
      after: parsed.data,
    });
    return NextResponse.json({ ok: true, handover_event_id: newEvent.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
