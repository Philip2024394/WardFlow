// POST /api/er/intake — ER triage report. Captures the chief complaint + symptom keywords
// + vitals snapshot. Returns the intake_id so the caller can immediately ask
// /api/doctors/suggest?intakeId=... for a ranked doctor list.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  chief_complaint: z.string().min(2).max(2000),
  symptom_keywords: z.array(z.string().min(1).max(40)).max(50).default([]),
  severity: z.enum(['1', '2', '3', '4', '5']).default('3'),
  blood_pressure_systolic: z.number().int().min(40).max(300).optional(),
  blood_pressure_diastolic: z.number().int().min(20).max(200).optional(),
  temperature_c: z.number().min(25).max(45).optional(),
  heart_rate_bpm: z.number().int().min(20).max(250).optional(),
  oxygen_pct: z.number().int().min(40).max(100).optional(),
  pain_score: z.number().int().min(0).max(10).optional(),
  cognitive_status_observed: z.enum(['alert', 'confused', 'unconscious']).optional(),
  is_conscious: z.boolean().default(true),
  preferred_gender: z.enum(['M', 'F', 'any']).default('any'),
  preferred_languages: z.array(z.string().min(1).max(40)).max(10).default([]),
  known_allergies: z.array(z.string().min(1).max(120)).max(50).default([]),
  notes: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
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

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

    const { data: ins, error: insErr } = await supabase
      .from('er_intake_reports')
      .insert({
        patient_id: parsed.data.patient_id,
        er_staff_user_id: user.id,
        chief_complaint: parsed.data.chief_complaint,
        symptom_keywords: parsed.data.symptom_keywords,
        severity: parsed.data.severity,
        blood_pressure_systolic: parsed.data.blood_pressure_systolic ?? null,
        blood_pressure_diastolic: parsed.data.blood_pressure_diastolic ?? null,
        temperature_c: parsed.data.temperature_c ?? null,
        heart_rate_bpm: parsed.data.heart_rate_bpm ?? null,
        oxygen_pct: parsed.data.oxygen_pct ?? null,
        pain_score: parsed.data.pain_score ?? null,
        cognitive_status_observed: parsed.data.cognitive_status_observed ?? null,
        is_conscious: parsed.data.is_conscious,
        preferred_gender: parsed.data.preferred_gender,
        preferred_languages: parsed.data.preferred_languages,
        known_allergies: parsed.data.known_allergies,
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single();
    if (insErr || !ins) {
      return NextResponse.json(
        { error: 'insert_failed', detail: insErr?.message },
        { status: 500 },
      );
    }

    await logAuditEvent({
      action: 'er.intake.create',
      entity_type: 'er_intake_reports',
      entity_id: ins.id,
      after: { patient_id: parsed.data.patient_id, severity: parsed.data.severity },
    });

    return NextResponse.json({ ok: true, intake_id: ins.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
