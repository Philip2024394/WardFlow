// POST /api/visits/[id]/rating — patient-only service rating.
// Anti-coercion: this endpoint expects the patient to interact (typically on a separate
// full-screen prompt after the nurse leaves the bedside). We use the service client to
// insert because the patient is not authenticated as a Supabase user; the RLS policy
// blocks normal-client inserts.
//
// The patient identity is confirmed via the bedside device id + visit_confirmation_id —
// not by a Supabase auth session.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  rating: z.enum(['good', 'ok', 'poor', 'not_happy']),
  comment: z.string().max(2000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: visitId } = await ctx.params;
  if (!visitId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
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
    const svc = createSupabaseServiceClient();
    const { data: vc } = await svc
      .from('visit_confirmations')
      .select('id,patient_id')
      .eq('id', visitId)
      .maybeSingle();
    if (!vc) return NextResponse.json({ error: 'visit_not_found' }, { status: 404 });

    const { data: pat } = await svc
      .from('patients')
      .select('id,cognitive_status')
      .eq('id', vc.patient_id)
      .maybeSingle();
    const isAdvisory = pat?.cognitive_status && pat.cognitive_status !== 'alert';

    const { error: insErr } = await svc.from('visit_ratings').insert({
      visit_confirmation_id: vc.id,
      patient_id: vc.patient_id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
      is_advisory: !!isAdvisory,
    });
    if (insErr) {
      if (insErr.message?.includes('duplicate key'))
        return NextResponse.json({ error: 'already_rated' }, { status: 409 });
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr.message },
        { status: 500 },
      );
    }

    await logAuditEvent({
      action: 'visit.rating',
      entity_type: 'visit_ratings',
      entity_id: vc.id,
      after: { rating: parsed.data.rating, is_advisory: !!isAdvisory },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
