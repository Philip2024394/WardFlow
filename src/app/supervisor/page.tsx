// Supervisor dashboard — open red alerts + acknowledge + override.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SupervisorView, type AlertRow } from './view';

export const dynamic = 'force-dynamic';

async function loadAlerts(): Promise<AlertRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('alerts')
      .select('id,kind,state,patient_id,nurse_user_id,scheduled_visit_id,payload,opened_at')
      .eq('state', 'open')
      .order('opened_at', { ascending: false })
      .limit(60);
    return (data as AlertRow[]) ?? [];
  } catch {
    return [];
  }
}

export default async function SupervisorPage() {
  const alerts = await loadAlerts();
  return <SupervisorView initialAlerts={alerts} />;
}
