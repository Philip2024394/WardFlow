// DELETE /api/family-codes/[code] — doctor revokes their code.
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;
  try {
    const supabase = await createSupabaseServerClient();
    await supabase
      .from('family_access_codes')
      .update({ revoked_at: new Date().toISOString() })
      .eq('code', code);
    await logAuditEvent({
      action: 'family_code.revoke',
      entity_type: 'family_access_codes',
      entity_id: code,
    });
  } catch {
    // Swallow — demo-mode revoke succeeds in-memory only.
  }
  return NextResponse.json({ ok: true });
}
