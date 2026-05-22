// Hospital-wide red-alert grid. Every active patient as a card, color-coded by
// SLA window. Audible chime when any patient flips to red.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DashboardGrid, type PatientCard } from './grid';

export const dynamic = 'force-dynamic';

async function load(): Promise<PatientCard[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('patients')
      .select(
        'id,full_name,bed_no,ward_id,risk_level,assigned_doctor_id,assigned_nurse_id,wards(name,code)',
      )
      .limit(200);
    type Row = {
      id: string;
      full_name: string;
      bed_no: string | null;
      ward_id: string | null;
      risk_level: string;
      assigned_doctor_id: string | null;
      assigned_nurse_id: string | null;
      wards: { name: string | null; code: string | null } | null;
    };
    const rows = ((data ?? []) as unknown) as Row[];
    // For each patient, fetch their next scheduled visit + last confirmation.
    const ids = rows.map((r) => r.id);
    let nextVisits: Record<string, { due_at: string; status: string }> = {};
    let lastVisits: Record<string, string> = {};
    if (ids.length) {
      const { data: nv } = await supabase
        .from('scheduled_visits')
        .select('patient_id,due_at,status')
        .in('patient_id', ids)
        .eq('status', 'pending')
        .order('due_at')
        .limit(500);
      for (const r of (nv as { patient_id: string; due_at: string; status: string }[]) ?? []) {
        if (!nextVisits[r.patient_id]) nextVisits[r.patient_id] = { due_at: r.due_at, status: r.status };
      }
      const { data: lv } = await supabase
        .from('visit_confirmations')
        .select('patient_id,occurred_at')
        .in('patient_id', ids)
        .order('occurred_at', { ascending: false })
        .limit(500);
      for (const r of (lv as { patient_id: string; occurred_at: string }[]) ?? []) {
        if (!lastVisits[r.patient_id]) lastVisits[r.patient_id] = r.occurred_at;
      }
    }
    return rows.map((r) => ({
      patient_id: r.id,
      patient_name: r.full_name,
      bed_no: r.bed_no,
      ward_name: r.wards?.name ?? null,
      ward_code: r.wards?.code ?? null,
      risk_level: r.risk_level as PatientCard['risk_level'],
      doctor_id: r.assigned_doctor_id,
      nurse_id: r.assigned_nurse_id,
      next_due_at: nextVisits[r.id]?.due_at ?? null,
      last_visit_at: lastVisits[r.id] ?? null,
    }));
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const cards = await load();
  return <DashboardGrid initialCards={cards} />;
}
