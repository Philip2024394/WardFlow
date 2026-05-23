// PATCH /api/procedures/[id] — doctor updates a procedure (status, result, cancel).
// Order fields are blocked by the DB immutability trigger; we only PATCH
// status + performed_by + performed_at + result_summary + result_values +
// result_media_id + cancelled_at + cancelled_by + cancelled_reason.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const PatchSchema = z.object({
  status: z.enum(['ordered', 'in_progress', 'completed', 'cancelled']).optional(),
  performed_by: z.string().uuid().optional(),
  performed_at: z.string().optional(),
  result_summary: z.string().max(10_000).optional(),
  result_values: z.record(z.unknown()).optional(),
  result_media_id: z.string().uuid().optional(),
  cancelled_reason: z.string().min(3).max(2000).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'doctor') {
    return NextResponse.json({ error: 'doctor_only' }, { status: 403 });
  }

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.performed_by) updates.performed_by = parsed.data.performed_by;
  if (parsed.data.performed_at) updates.performed_at = parsed.data.performed_at;
  if (parsed.data.result_summary !== undefined)
    updates.result_summary = parsed.data.result_summary;
  if (parsed.data.result_values !== undefined)
    updates.result_values = parsed.data.result_values;
  if (parsed.data.result_media_id) updates.result_media_id = parsed.data.result_media_id;

  if (parsed.data.status === 'completed' && !updates.performed_at) {
    updates.performed_at = new Date().toISOString();
  }
  if (parsed.data.status === 'completed' && !updates.performed_by) {
    updates.performed_by = session.user_id;
  }
  if (parsed.data.status === 'cancelled') {
    if (!parsed.data.cancelled_reason) {
      return NextResponse.json(
        { error: 'cancelled_reason_required' },
        { status: 400 },
      );
    }
    updates.cancelled_at = new Date().toISOString();
    updates.cancelled_by = session.user_id;
    updates.cancelled_reason = parsed.data.cancelled_reason;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('procedures')
    .update(updates)
    .eq('id', id)
    .select('id,status,performed_at,performed_by,result_summary,result_values,cancelled_at,cancelled_reason')
    .single();
  if (error) {
    return NextResponse.json(
      { error: 'update_failed', detail: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, procedure: data });
}
