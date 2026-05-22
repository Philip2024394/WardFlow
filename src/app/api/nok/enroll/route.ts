// POST /api/nok/enroll — ER enrolls a next-of-kin at patient intake.
// Issues an access code the family member can later use to sign in via /api/nok/session.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { generateAccessCode } from '@/lib/family/session';
import { logAuditEvent } from '@/lib/audit/log';

const Schema = z.object({
  patient_id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  relationship: z.string().max(40),
  phone_e164: z.string().regex(/^\+\d{6,15}$/).optional(),
  email: z.string().email().optional(),
  id_document_url: z.string().url().optional(),
  consent_signed: z.boolean().default(true),
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

    const accessCode = generateAccessCode();
    const svc = createSupabaseServiceClient();
    const { data: ins, error: insErr } = await svc
      .from('family_contacts')
      .insert({
        patient_id: parsed.data.patient_id,
        full_name: parsed.data.full_name,
        relationship: parsed.data.relationship,
        phone_e164: parsed.data.phone_e164 ?? null,
        email: parsed.data.email ?? null,
        is_next_of_kin: true,
        id_document_url: parsed.data.id_document_url ?? null,
        consent_signed_at: parsed.data.consent_signed ? new Date().toISOString() : null,
        enrolled_at_er_by: user.id,
        access_code: accessCode,
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
      action: 'nok.enroll',
      entity_type: 'family_contacts',
      entity_id: ins.id,
      after: { patient_id: parsed.data.patient_id, relationship: parsed.data.relationship },
    });

    return NextResponse.json({ ok: true, family_contact_id: ins.id, access_code: accessCode });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
