// POST /api/alerts/ack — supervisor acknowledges a red alert with a required reason note.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  alert_id: z.string().uuid(),
  reason_note: z.string().min(3).max(2000),
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
    const ackedAt = new Date().toISOString();

    const { error: ackErr } = await svc.from('alert_acknowledgements').insert({
      alert_id: parsed.data.alert_id,
      supervisor_user_id: user.id,
      reason_note: parsed.data.reason_note,
      acknowledged_at: ackedAt,
    });
    if (ackErr) {
      return NextResponse.json(
        { error: 'insert_failed', detail: ackErr.message },
        { status: 500 },
      );
    }

    await svc
      .from('alerts')
      .update({ state: 'acknowledged', acknowledged_at: ackedAt })
      .eq('id', parsed.data.alert_id)
      .eq('state', 'open');

    await logAuditEvent({
      action: 'alert.ack',
      entity_type: 'alerts',
      entity_id: parsed.data.alert_id,
      after: { reason_note: parsed.data.reason_note },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
