// POST /api/doctor/assign — doctor self-assigns + sets primary/backup nurse for a patient.
// Creates a new doctor_assignments row and supersedes any prior active one.
// origin = 'bedside_fingerprint' if signature payload present, else 'remote_authenticated'.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  primary_nurse_id: z.string().uuid().optional(),
  backup_nurse_id: z.string().uuid().optional(),
  origin: z.enum(['bedside_fingerprint', 'remote_authenticated']).default('remote_authenticated'),
  notes: z.string().max(2000).optional(),
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

    const { data: meRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (meRow?.role !== 'doctor' && meRow?.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const svc = createSupabaseServiceClient();
    const { data: existing } = await svc
      .from('doctor_assignments')
      .select('id')
      .eq('patient_id', parsed.data.patient_id)
      .is('superseded_at', null)
      .maybeSingle();

    const { data: newRow, error: insErr } = await svc
      .from('doctor_assignments')
      .insert({
        patient_id: parsed.data.patient_id,
        doctor_user_id: user.id,
        primary_nurse_id: parsed.data.primary_nurse_id ?? null,
        backup_nurse_id: parsed.data.backup_nurse_id ?? null,
        origin: parsed.data.origin,
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single();
    if (insErr || !newRow) {
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    if (existing) {
      await svc.rpc('supersede_doctor_assignment', { p_id: existing.id, p_new_id: newRow.id });
    }

    // Mirror onto patients table for legacy reads.
    await svc
      .from('patients')
      .update({
        assigned_doctor_id: user.id,
        assigned_nurse_id: parsed.data.primary_nurse_id ?? null,
      })
      .eq('id', parsed.data.patient_id);

    await logAuditEvent({
      action: 'doctor.assign',
      entity_type: 'doctor_assignments',
      entity_id: newRow.id,
      after: parsed.data,
    });

    return NextResponse.json({ ok: true, assignment_id: newRow.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
