// POST /api/nok/session — next-of-kin signs in with the access code issued at ER enrollment.
// Sets the same family-session cookie used by /api/family-session so the existing
// family RLS path (family_patient_id()) works for the NOK portal too.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildFamilyCookie } from '@/lib/family/session';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  access_code: z.string().min(8).max(40),
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
    const svc = createSupabaseServiceClient();
    const { data: row } = await svc
      .from('family_contacts')
      .select('id,patient_id,is_next_of_kin,full_name')
      .eq('access_code', parsed.data.access_code)
      .maybeSingle();
    if (!row || !row.is_next_of_kin) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 });
    }

    const cookie = buildFamilyCookie(
      {
        code: parsed.data.access_code,
        patient_id: row.patient_id,
        // NOK sees more than read-only family; sections include 'doctor_proposals'
        allowed_sections: ['care_rounds', 'doctor_notes', 'emergency_info', 'doctor_proposals'],
      },
      120, // 2-hour session
    );

    const res = NextResponse.json({
      ok: true,
      patient_id: row.patient_id,
      nok_name: row.full_name,
    });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    await logAuditEvent({
      action: 'nok.session.start',
      entity_type: 'family_contacts',
      entity_id: row.id,
      after: { patient_id: row.patient_id },
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
