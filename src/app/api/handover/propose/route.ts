// POST /api/handover/propose — ER staff proposes one or more ward nurses for a patient.
// Until a nurse accepts, the patient remains in ER's care (DB trigger guard_patient_ward_entry
// enforces this hard).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  to_ward_id: z.string().uuid(),
  nurses: z
    .array(
      z.object({
        nurse_user_id: z.string().uuid(),
        role: z.enum(['primary', 'backup']).default('primary'),
      }),
    )
    .min(1)
    .max(5),
  notes: z.string().max(2000).optional(),
  pending_tasks: z.string().max(2000).optional(),
  medication_status: z.string().max(2000).optional(),
  patient_condition: z.string().max(2000).optional(),
  expires_in_minutes: z.number().int().min(5).max(180).default(30),
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

    const expiresAt = new Date(
      Date.now() + parsed.data.expires_in_minutes * 60_000,
    ).toISOString();

    // Insert proposal
    const { data: prop, error: propErr } = await supabase
      .from('handover_proposals')
      .insert({
        patient_id: parsed.data.patient_id,
        proposed_by: user.id,
        to_ward_id: parsed.data.to_ward_id,
        notes: parsed.data.notes ?? null,
        pending_tasks: parsed.data.pending_tasks ?? null,
        medication_status: parsed.data.medication_status ?? null,
        patient_condition: parsed.data.patient_condition ?? null,
        expires_at: expiresAt,
        status: 'pending',
      })
      .select('id,expires_at')
      .single();
    if (propErr || !prop) {
      return NextResponse.json({ error: 'propose_failed', detail: propErr?.message }, { status: 500 });
    }

    // Insert nurses junction
    const rows = parsed.data.nurses.map((n) => ({
      proposal_id: prop.id,
      nurse_user_id: n.nurse_user_id,
      role: n.role,
    }));
    const { error: junErr } = await supabase.from('handover_proposal_nurses').insert(rows);
    if (junErr) {
      return NextResponse.json({ error: 'nurses_insert_failed', detail: junErr.message }, { status: 500 });
    }

    await logAuditEvent({
      action: 'handover.propose',
      entity_type: 'handover_proposals',
      entity_id: prop.id,
      after: { ...parsed.data, expires_at: prop.expires_at },
    });

    return NextResponse.json({ proposal_id: prop.id, expires_at: prop.expires_at });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
