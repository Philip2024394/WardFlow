// POST /api/handover/[id]/decline — nurse declines a proposal.
// If all proposed nurses decline, the proposal flips to 'declined' and ER can re-propose.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({ reason: z.string().max(1000).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: proposalId } = await ctx.params;
  if (!proposalId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
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

    const { data: hpn } = await supabase
      .from('handover_proposal_nurses')
      .select('id,accepted_at,declined_at')
      .eq('proposal_id', proposalId)
      .eq('nurse_user_id', user.id)
      .maybeSingle();
    if (!hpn) return NextResponse.json({ error: 'not_invited' }, { status: 403 });
    if (hpn.accepted_at)
      return NextResponse.json({ error: 'already_accepted' }, { status: 409 });
    if (hpn.declined_at)
      return NextResponse.json({ error: 'already_declined' }, { status: 409 });

    const declinedAt = new Date().toISOString();
    await supabase
      .from('handover_proposal_nurses')
      .update({ declined_at: declinedAt, decline_reason: parsed.data.reason ?? null })
      .eq('id', hpn.id);

    // If every proposed nurse has now declined, mark the proposal declined.
    const { data: junctions } = await supabase
      .from('handover_proposal_nurses')
      .select('accepted_at,declined_at')
      .eq('proposal_id', proposalId);
    if (junctions && junctions.length > 0 && junctions.every((j) => j.declined_at)) {
      const svc = createSupabaseServiceClient();
      await svc
        .from('handover_proposals')
        .update({ status: 'declined', resolved_at: declinedAt })
        .eq('id', proposalId);
    }

    await logAuditEvent({
      action: 'handover.decline',
      entity_type: 'handover_proposal_nurses',
      entity_id: hpn.id,
      after: { reason: parsed.data.reason ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
