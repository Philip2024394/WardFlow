// Doctor inbox — proposals I'm the target of, plus a quick self-propose tool.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DoctorInbox, type ProposalRow } from './inbox';

export const dynamic = 'force-dynamic';

async function load(): Promise<{ proposals: ProposalRow[]; selfId: string | null }> {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { proposals: [], selfId: null };
    const { data } = await supabase
      .from('doctor_proposals')
      .select('id,patient_id,target_doctor_id,proposed_by,origin,reason,status,expires_at,created_at')
      .eq('target_doctor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40);
    return {
      proposals: (data as ProposalRow[]) ?? [],
      selfId: user.id,
    };
  } catch {
    return { proposals: [], selfId: null };
  }
}

export default async function DoctorInboxPage() {
  const { proposals, selfId } = await load();
  return <DoctorInbox initialProposals={proposals} selfDoctorId={selfId} />;
}
