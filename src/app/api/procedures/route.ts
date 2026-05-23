// GET  /api/procedures?patient_id=X — list procedures for a patient
// POST /api/procedures — doctor orders a new procedure
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const PROCEDURE_KINDS = [
  'xray', 'blood_test', 'ct_scan', 'mri', 'ultrasound', 'ecg',
  'urine_test', 'biopsy', 'culture', 'endoscopy', 'other',
] as const;

const PostSchema = z.object({
  patient_id: z.string().uuid(),
  intake_id: z.string().uuid().optional(),
  kind: z.enum(PROCEDURE_KINDS),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const patientId = url.searchParams.get('patient_id');
  if (!patientId) {
    return NextResponse.json({ error: 'missing_patient_id' }, { status: 400 });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('procedures')
    .select(
      'id,patient_id,intake_id,kind,status,ordered_by,ordered_at,notes,' +
      'performed_by,performed_at,result_summary,result_values,result_media_id,' +
      'cancelled_at,cancelled_by,cancelled_reason,created_at,updated_at,' +
      'ordered_user:users!procedures_ordered_by_fkey(full_name)',
    )
    .eq('patient_id', patientId)
    .order('ordered_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ procedures: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'doctor') {
    return NextResponse.json({ error: 'doctor_only' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('procedures')
    .insert({
      patient_id: parsed.data.patient_id,
      intake_id: parsed.data.intake_id ?? null,
      kind: parsed.data.kind,
      notes: parsed.data.notes ?? null,
      ordered_by: session.user_id,
    })
    .select('id,kind,status,ordered_at')
    .single();
  if (error) {
    return NextResponse.json(
      { error: 'insert_failed', detail: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, procedure: data });
}
