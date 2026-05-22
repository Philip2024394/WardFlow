// Nurse handover queue. Replaces Phase-0 stub.
// Server component fetches outstanding proposals; client island handles accept/decline.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getRole } from '@/lib/auth/role';
import { HandoverInbox, type HandoverProposalRow } from './inbox';

export const dynamic = 'force-dynamic';

async function loadProposals(): Promise<HandoverProposalRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from('handover_proposal_nurses')
      .select(
        'id,role,accepted_at,declined_at,acceptance_method,handover_proposals(id,patient_id,to_ward_id,notes,pending_tasks,medication_status,patient_condition,status,expires_at,created_at,proposed_by)',
      )
      .eq('nurse_user_id', user.id)
      .order('id', { ascending: false })
      .limit(40);

    type Row = {
      id: string;
      role: string;
      accepted_at: string | null;
      declined_at: string | null;
      acceptance_method: string | null;
      handover_proposals:
        | {
            id: string;
            patient_id: string;
            to_ward_id: string;
            notes: string | null;
            pending_tasks: string | null;
            medication_status: string | null;
            patient_condition: string | null;
            status: string;
            expires_at: string;
            created_at: string;
            proposed_by: string;
          }
        | null;
    };
    const rows = ((data ?? []) as unknown) as Row[];
    return rows
      .filter((r) => r.handover_proposals)
      .map((r) => ({
        junction_id: r.id,
        role: r.role,
        accepted_at: r.accepted_at,
        declined_at: r.declined_at,
        proposal_id: r.handover_proposals!.id,
        patient_id: r.handover_proposals!.patient_id,
        to_ward_id: r.handover_proposals!.to_ward_id,
        notes: r.handover_proposals!.notes,
        pending_tasks: r.handover_proposals!.pending_tasks,
        medication_status: r.handover_proposals!.medication_status,
        patient_condition: r.handover_proposals!.patient_condition,
        status: r.handover_proposals!.status,
        expires_at: r.handover_proposals!.expires_at,
        created_at: r.handover_proposals!.created_at,
        proposed_by: r.handover_proposals!.proposed_by,
      }));
  } catch {
    return [];
  }
}

export default async function HandoverPage() {
  // Best-effort role gate. If Supabase isn't configured yet, getRole returns nulls and
  // we still render the empty-state shell so the route is visible in dev.
  await getRole();
  const rows = await loadProposals();
  return <HandoverInbox initialRows={rows} />;
}
