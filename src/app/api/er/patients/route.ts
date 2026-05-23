// POST /api/er/patients — ER admin creates a new patient at the ER door, OR
// records a new ER arrival for an EXISTING patient (returning patient).
//
// If existing_patient_id is provided: skip patient row insert, skip family
// code issuance (the patient/family already has a code from their first
// admission), skip wristband (their existing band is still valid; if it's
// been replaced, rotate via /api/wristband/rotate). Only the new
// er_intake_report row is created.
//
// Otherwise: full create flow (patients + family_access_code +
// wristband token + initial intake).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';
import { generateAccessCode } from '@/lib/family/session';

const Schema = z.object({
  existing_patient_id: z.string().uuid().optional(),
  full_name: z.string().min(2).max(120),
  dob: z.string().optional(),
  gender: z.enum(['M', 'F', 'X']).optional(),
  country: z.string().max(40).optional(),
  allergies: z.array(z.string()).optional(),
  entry_at: z.string().optional(),
  arrival_reason: z.string().min(2).max(500),
  chief_complaint: z.string().min(2).max(500),
  medications_given_in_er: z.array(z.string()).optional(),
  er_treating_doctor_id: z.string().uuid().optional(),
  assigned_ward_id: z.string().uuid().optional(),
  severity: z.enum(['1', '2', '3', '4', '5']).optional(),
  blood_pressure_systolic: z.number().int().optional(),
  blood_pressure_diastolic: z.number().int().optional(),
  temperature_c: z.number().optional(),
  heart_rate_bpm: z.number().int().optional(),
  oxygen_pct: z.number().int().optional(),
  pain_score: z.number().int().min(0).max(10).optional(),
});

const FAMILY_TTL_DAYS = 30;

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;

  const supabase = createSupabaseServiceClient();
  let patientId: string;
  let familyCode: string | null = null;
  let wristbandToken: string | null = null;

  if (v.existing_patient_id) {
    const { data: existing, error: exErr } = await supabase
      .from('patients')
      .select('id')
      .eq('id', v.existing_patient_id)
      .maybeSingle();
    if (exErr || !existing) {
      return NextResponse.json({ error: 'existing_patient_not_found' }, { status: 404 });
    }
    patientId = existing.id as string;
  } else {
    const { data: patient, error: patErr } = await supabase
      .from('patients')
      .insert({
        full_name: v.full_name,
        dob: v.dob ?? null,
        gender: v.gender ?? null,
        country: v.country ?? null,
        allergies: v.allergies ?? [],
        created_by: session.user_id,
      })
      .select('id')
      .single();
    if (patErr || !patient) {
      return NextResponse.json(
        { error: 'patient_insert_failed', detail: patErr?.message },
        { status: 400 },
      );
    }
    patientId = patient.id;

    familyCode = generateAccessCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + FAMILY_TTL_DAYS);
    const { error: codeErr } = await supabase.from('family_access_codes').insert({
      code: familyCode,
      patient_id: patientId,
      granted_by_doctor_id: session.user_id,
      allowed_sections: [
        'care_rounds',
        'emergency_info',
        'medications',
        'doctor_updates',
      ],
      expires_at: expiresAt.toISOString(),
    });
    if (codeErr) {
      return NextResponse.json(
        { error: 'code_insert_failed', detail: codeErr.message },
        { status: 500 },
      );
    }

    const { data: tokenRow, error: tokErr } = await supabase
      .rpc('generate_wristband_token')
      .single();
    if (tokErr || typeof tokenRow !== 'string') {
      return NextResponse.json(
        { error: 'token_gen_failed', detail: tokErr?.message },
        { status: 500 },
      );
    }
    wristbandToken = tokenRow;
    const { error: insTokErr } = await supabase
      .from('patient_wristband_tokens')
      .insert({
        patient_id: patientId,
        token: wristbandToken,
        issued_by: session.user_id,
      });
    if (insTokErr) {
      return NextResponse.json(
        { error: 'token_insert_failed', detail: insTokErr.message },
        { status: 500 },
      );
    }
  }

  const { data: intake, error: intakeErr } = await supabase
    .from('er_intake_reports')
    .insert({
      patient_id: patientId,
      er_staff_user_id: session.user_id,
      entry_at: v.entry_at ?? new Date().toISOString(),
      arrival_reason: v.arrival_reason,
      chief_complaint: v.chief_complaint,
      symptom_keywords: [],
      severity: v.severity ?? '3',
      blood_pressure_systolic: v.blood_pressure_systolic,
      blood_pressure_diastolic: v.blood_pressure_diastolic,
      temperature_c: v.temperature_c,
      heart_rate_bpm: v.heart_rate_bpm,
      oxygen_pct: v.oxygen_pct,
      pain_score: v.pain_score,
      medications_given_in_er: v.medications_given_in_er ?? [],
      er_treating_doctor_id: v.er_treating_doctor_id,
      assigned_ward_id: v.assigned_ward_id,
      known_allergies: v.allergies ?? [],
    })
    .select('id')
    .single();
  if (intakeErr) {
    return NextResponse.json(
      { error: 'intake_insert_failed', detail: intakeErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    patient_id: patientId,
    intake_id: intake?.id,
    family_code: familyCode,
    wristband_token: wristbandToken,
    is_returning: !!v.existing_patient_id,
  });
}
