// POST /api/family-session — verify code, set signed cookie.
// DELETE /api/family-session — clear cookie.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildFamilyCookie, FAMILY_COOKIE_NAME } from '@/lib/family/session';

const Schema = z.object({ code: z.string().min(8).max(64) });

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const code = parsed.data.code.trim().toUpperCase();

  let patientId = 'demo-patient';
  let allowed: string[] = ['care_rounds', 'emergency_info'];

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('family_access_codes')
      .select('code, patient_id, allowed_sections, expires_at, revoked_at')
      .eq('code', code)
      .maybeSingle();
    if (!error && data) {
      if (data.revoked_at) {
        return NextResponse.json({ error: 'revoked' }, { status: 403 });
      }
      if (new Date(data.expires_at) < new Date()) {
        return NextResponse.json({ error: 'expired' }, { status: 403 });
      }
      patientId = data.patient_id;
      allowed = (data.allowed_sections as string[]) ?? allowed;

      // Log the access attempt.
      await supabase.from('family_access_log').insert({
        code,
        ip: req.headers.get('x-forwarded-for'),
        user_agent: req.headers.get('user-agent'),
        sections_viewed: allowed,
      });
    } else if (process.env.NODE_ENV === 'production') {
      // In prod, unknown codes fail closed.
      return NextResponse.json({ error: 'invalid' }, { status: 404 });
    }
  } catch {
    // Supabase not configured — demo mode accepts any well-formed code.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
    }
  }

  const cookie = buildFamilyCookie({
    code,
    patient_id: patientId,
    allowed_sections: allowed,
  });
  const cookieStore = await cookies();
  cookieStore.set(cookie.name, cookie.value, cookie.options);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(FAMILY_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
