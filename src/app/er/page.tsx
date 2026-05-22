// Emergency staff — propose ward nurses for a patient being transferred out of ER.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ErProposeView, type WardOption, type NurseOption, type PatientOption } from './propose';

export const dynamic = 'force-dynamic';

async function loadInitial(): Promise<{
  patients: PatientOption[];
  wards: WardOption[];
  nurses: NurseOption[];
}> {
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: pts }, { data: wds }, { data: nrs }] = await Promise.all([
      supabase
        .from('patients')
        .select('id,full_name,bed_no')
        .is('er_handover_completed_at', null)
        .limit(50),
      supabase.from('wards').select('id,name,code').limit(50),
      supabase
        .from('nurses')
        .select('user_id,wf_id,specialization,is_online,users(full_name,photo_url)')
        .limit(100),
    ]);
    return {
      patients: ((pts ?? []) as unknown) as PatientOption[],
      wards: ((wds ?? []) as unknown) as WardOption[],
      nurses: ((nrs ?? []) as unknown) as NurseOption[],
    };
  } catch {
    return { patients: [], wards: [], nurses: [] };
  }
}

export default async function ErPage() {
  const initial = await loadInitial();
  return <ErProposeView {...initial} />;
}
