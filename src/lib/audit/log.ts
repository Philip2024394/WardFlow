// Audit helper. Writes to public.audit_logs. INSERT-only — DB trigger enforces immutability.
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AuditEventInput {
  action: string; // e.g. 'patient.round.create'
  entity_type: string; // e.g. 'patient_rounds'
  entity_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
  device_id?: string | null;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('audit_logs').insert({
      actor_user_id: user?.id ?? null,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      device_id: input.device_id ?? null,
    });
  } catch (err) {
    // Audit MUST never break the user flow — log but swallow.
    // eslint-disable-next-line no-console
    console.error('[audit] failed to log event', input.action, err);
  }
}
