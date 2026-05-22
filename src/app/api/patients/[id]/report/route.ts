// GET /api/patients/[id]/report — JSON dump of the patient's full audit-grade timeline.
// The /patients/[id]/report page renders this for print (A4) via CSS @media print.
// Doctors + supervisors + admin only.
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
    const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    const allowed = me?.role && ['doctor', 'supervisor', 'admin'].includes(me.role);
    if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const [patient, handovers, docAssignments, visits, ratings, orders, alerts, overrides] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).maybeSingle(),
      supabase.from('handover_events').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('doctor_assignments').select('*').eq('patient_id', id).order('created_at'),
      supabase
        .from('visit_confirmations')
        .select('*')
        .eq('patient_id', id)
        .order('occurred_at'),
      supabase.from('visit_ratings').select('*').eq('patient_id', id).order('submitted_at'),
      supabase.from('doctor_orders').select('*').eq('patient_id', id).order('created_at'),
      supabase.from('alerts').select('*').eq('patient_id', id).order('opened_at'),
      supabase.from('supervisor_overrides').select('*').eq('patient_id', id).order('created_at'),
    ]);

    return NextResponse.json({
      patient: patient.data ?? null,
      handovers: handovers.data ?? [],
      doctor_assignments: docAssignments.data ?? [],
      visits: visits.data ?? [],
      ratings: ratings.data ?? [],
      orders: orders.data ?? [],
      alerts: alerts.data ?? [],
      overrides: overrides.data ?? [],
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
