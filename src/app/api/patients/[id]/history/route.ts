// GET /api/patients/[id]/history — chronological care-history feed for a patient.
// Aggregates: ER intakes, doctor assignments, doctor orders, procedures,
// visit confirmations. Newest first. Returns one flat array of events plus a
// patient-meta block.
//
// Auth: any staff session (nurse/doctor); family session if their cookie's
// patient_id matches the URL id.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';
import { verifyFamilyCookie, FAMILY_COOKIE_NAME } from '@/lib/family/session';

type Event = {
  kind:
    | 'er_intake'
    | 'doctor_assignment'
    | 'doctor_order'
    | 'procedure'
    | 'visit_confirmation';
  occurred_at: string;
  summary: string;
  details: Record<string, unknown>;
  actor_name?: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: patientId } = await params;

  const staff = await getStaffSession();
  let authorized = !!staff;
  if (!authorized) {
    const store = await cookies();
    const fam = verifyFamilyCookie(store.get(FAMILY_COOKIE_NAME)?.value);
    if (fam && fam.patient_id === patientId) authorized = true;
  }
  if (!authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();

  const [patientRes, intakesRes, assignmentsRes, ordersRes, proceduresRes, visitsRes] =
    await Promise.all([
      supabase
        .from('patients')
        .select('id,full_name,dob,gender,country,allergies,blood_type,ward_id,bed_no,risk_level,admitted_at')
        .eq('id', patientId)
        .maybeSingle(),
      supabase
        .from('er_intake_reports')
        .select(
          'id,entry_at,created_at,arrival_reason,chief_complaint,severity,medications_given_in_er,assigned_ward_id,er_staff_user_id,er_treating_doctor_id,' +
            'er_staff:users!er_intake_reports_er_staff_user_id_fkey(full_name)',
        )
        .eq('patient_id', patientId)
        .order('entry_at', { ascending: false }),
      supabase
        .from('doctor_assignments')
        .select(
          'id,created_at,origin,notes,superseded_at,doctor_user_id,' +
            'doctor:users!doctor_assignments_doctor_user_id_fkey(full_name)',
        )
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('doctor_orders')
        .select(
          'id,created_at,kind,origin,drug_name,dose,route,schedule_cron,duration,body,fulfilled_at,superseded_at,' +
            'doctor:users!doctor_orders_doctor_user_id_fkey(full_name)',
        )
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false }),
      supabase
        .from('procedures')
        .select(
          'id,ordered_at,performed_at,kind,status,notes,result_summary,cancelled_at,cancelled_reason,' +
            'ordered_user:users!procedures_ordered_by_fkey(full_name)',
        )
        .eq('patient_id', patientId)
        .order('ordered_at', { ascending: false }),
      supabase
        .from('visit_confirmations')
        .select(
          'id,occurred_at,method,signature_payload,' +
            'nurse:users!visit_confirmations_nurse_user_id_fkey(full_name)',
        )
        .eq('patient_id', patientId)
        .order('occurred_at', { ascending: false })
        .limit(50),
    ]);

  type Named = { full_name: string } | { full_name: string }[] | null;
  function nameOf(n: Named): string | null {
    if (!n) return null;
    if (Array.isArray(n)) return n[0]?.full_name ?? null;
    return n.full_name ?? null;
  }

  const events: Event[] = [];

  for (const i of (intakesRes.data ?? []) as unknown as Array<{
    id: string;
    entry_at: string | null;
    created_at: string;
    arrival_reason: string | null;
    chief_complaint: string;
    severity: string;
    medications_given_in_er: string[] | null;
    er_staff: Named;
  }>) {
    events.push({
      kind: 'er_intake',
      occurred_at: i.entry_at ?? i.created_at,
      summary: `ER arrival — ${i.arrival_reason ?? i.chief_complaint}`,
      details: {
        chief_complaint: i.chief_complaint,
        severity: i.severity,
        medications_given_in_er: i.medications_given_in_er ?? [],
      },
      actor_name: nameOf(i.er_staff),
    });
  }

  for (const a of (assignmentsRes.data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    origin: string;
    notes: string | null;
    superseded_at: string | null;
    doctor: Named;
  }>) {
    events.push({
      kind: 'doctor_assignment',
      occurred_at: a.created_at,
      summary: `Doctor assigned (${a.origin})${a.superseded_at ? ' — later superseded' : ''}`,
      details: { notes: a.notes ?? null },
      actor_name: nameOf(a.doctor),
    });
  }

  for (const o of (ordersRes.data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    kind: string;
    drug_name: string | null;
    dose: string | null;
    route: string | null;
    schedule_cron: string | null;
    duration: string | null;
    body: string | null;
    superseded_at: string | null;
    doctor: Named;
  }>) {
    let summary: string;
    if (o.kind === 'medication') {
      summary = `Medication ordered: ${o.drug_name ?? '—'} ${o.dose ?? ''} ${o.route ?? ''}`.trim();
    } else if (o.kind === 'treatment_note') {
      summary = `Treatment note: ${(o.body ?? '').slice(0, 120)}`;
    } else {
      summary = `Doctor request: ${o.kind.replace('_', ' ')}`;
    }
    events.push({
      kind: 'doctor_order',
      occurred_at: o.created_at,
      summary,
      details: {
        order_kind: o.kind,
        drug_name: o.drug_name,
        dose: o.dose,
        route: o.route,
        schedule_cron: o.schedule_cron,
        duration: o.duration,
        body: o.body,
        superseded: !!o.superseded_at,
      },
      actor_name: nameOf(o.doctor),
    });
  }

  for (const p of (proceduresRes.data ?? []) as unknown as Array<{
    id: string;
    ordered_at: string;
    performed_at: string | null;
    kind: string;
    status: string;
    notes: string | null;
    result_summary: string | null;
    cancelled_at: string | null;
    cancelled_reason: string | null;
    ordered_user: Named;
  }>) {
    const label = p.kind.replace('_', ' ');
    events.push({
      kind: 'procedure',
      occurred_at: p.performed_at ?? p.ordered_at,
      summary: `${label} — ${p.status.replace('_', ' ')}`,
      details: {
        procedure_kind: p.kind,
        status: p.status,
        notes: p.notes,
        result_summary: p.result_summary,
        cancelled_reason: p.cancelled_reason,
      },
      actor_name: nameOf(p.ordered_user),
    });
  }

  for (const v of (visitsRes.data ?? []) as unknown as Array<{
    id: string;
    occurred_at: string;
    method: string;
    signature_payload: Record<string, unknown> | null;
    nurse: Named;
  }>) {
    events.push({
      kind: 'visit_confirmation',
      occurred_at: v.occurred_at,
      summary: `Bedside visit (${v.method.replace('_', ' ')})`,
      details: {
        method: v.method,
        signature_payload: v.signature_payload ?? null,
      },
      actor_name: nameOf(v.nurse),
    });
  }

  events.sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  return NextResponse.json({
    patient: patientRes.data ?? null,
    events,
  });
}
