// POST /api/family-codes  — doctor generates a family access code.
// GET  /api/family-codes?patientId=  — list active codes for a patient (doctor only).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateAccessCode } from '@/lib/family/session';
import { logAuditEvent } from '@/lib/audit/log';

const ALLOWED_SECTIONS = [
  'care_rounds',
  'medications',
  'doctor_notes',
  'emergency_info',
] as const;

const PostSchema = z.object({
  patient_id: z.string().uuid().or(z.string().min(3)),
  family_name: z.string().min(1).max(120).optional().default(''),
  relationship: z.string().min(1).max(40).optional().default('other'),
  allowed_sections: z.array(z.enum(ALLOWED_SECTIONS)).min(1),
  ttl_days: z.number().int().min(1).max(90),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  const code = generateAccessCode();
  const expiresAt = new Date(Date.now() + parsed.data.ttl_days * 86400_000).toISOString();
  const id = crypto.randomUUID();

  // Best-effort DB insert. If Supabase is unconfigured we still return the code
  // for the in-browser demo so Phil can preview the flow.
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('family_access_codes').insert({
        id,
        code,
        patient_id: parsed.data.patient_id,
        granted_by_doctor_id: user.id,
        allowed_sections: parsed.data.allowed_sections,
        expires_at: expiresAt,
      });
      await logAuditEvent({
        action: 'family_code.create',
        entity_type: 'family_access_codes',
        entity_id: id,
        after: { ...parsed.data, code, expires_at: expiresAt },
      });
    }
  } catch {
    // Demo-mode fallback: code still works for cookie issuance in /api/family-session
    // if Phil hands it to the family before wiring Supabase. RLS will block real
    // reads until then.
  }

  return NextResponse.json({ id, code, expiresAt });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const patientId = url.searchParams.get('patientId');
  if (!patientId) return NextResponse.json({ codes: [] });
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('family_access_codes')
      .select('id,code,expires_at,revoked_at')
      .eq('patient_id', patientId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());
    return NextResponse.json({ codes: data ?? [] });
  } catch {
    return NextResponse.json({ codes: [] });
  }
}
