// POST /api/audit — client helper to record audit events.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  action: z.string().min(1).max(120),
  entity_type: z.string().min(1).max(80),
  entity_id: z.string().optional().nullable(),
  after: z.record(z.unknown()).optional().nullable(),
  user_agent: z.string().optional().nullable(),
  device_id: z.string().optional().nullable(),
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
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  await logAuditEvent({
    action: parsed.data.action,
    entity_type: parsed.data.entity_type,
    entity_id: parsed.data.entity_id ?? null,
    after: parsed.data.after ?? null,
    ip: req.headers.get('x-forwarded-for'),
    user_agent: parsed.data.user_agent ?? req.headers.get('user-agent'),
    device_id: parsed.data.device_id ?? null,
  });
  return NextResponse.json({ ok: true });
}
