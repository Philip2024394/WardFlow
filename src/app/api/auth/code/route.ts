// POST /api/auth/code — single entry from the landing page. Resolves a code
// against family_access_codes, nurses.login_code, or doctors.login_code (in that
// order), sets the appropriate cookie, and returns a redirect target.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildFamilyCookie } from '@/lib/family/session';
import { buildStaffCookie } from '@/lib/auth/staff-session';

const Schema = z.object({ code: z.string().min(6).max(64) });

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

  const supabase = createSupabaseServiceClient();
  const store = await cookies();

  // 1) patient/family code
  const { data: famCode } = await supabase
    .from('family_access_codes')
    .select('code, patient_id, allowed_sections, expires_at, revoked_at')
    .eq('code', code)
    .maybeSingle();
  if (famCode) {
    if (famCode.revoked_at) {
      return NextResponse.json({ error: 'revoked' }, { status: 403 });
    }
    if (new Date(famCode.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired' }, { status: 403 });
    }
    const cookie = buildFamilyCookie({
      code,
      patient_id: famCode.patient_id,
      allowed_sections: (famCode.allowed_sections as string[]) ?? [],
    });
    store.set(cookie.name, cookie.value, cookie.options);
    await supabase.from('family_access_log').insert({
      code,
      ip: req.headers.get('x-forwarded-for'),
      user_agent: req.headers.get('user-agent'),
      sections_viewed: (famCode.allowed_sections as string[]) ?? [],
    });
    return NextResponse.json({ ok: true, redirect: '/family/view' });
  }

  // 2) nurse code
  const { data: nurse } = await supabase
    .from('nurses')
    .select('user_id, wf_id')
    .eq('login_code', code)
    .maybeSingle();
  if (nurse) {
    const cookie = buildStaffCookie({
      user_id: nurse.user_id,
      wf_id: nurse.wf_id,
      role: 'nurse',
    });
    store.set(cookie.name, cookie.value, cookie.options);
    return NextResponse.json({ ok: true, redirect: '/dashboard' });
  }

  // 3) doctor code
  const { data: doctor } = await supabase
    .from('doctors')
    .select('user_id, wf_id')
    .eq('login_code', code)
    .maybeSingle();
  if (doctor) {
    const cookie = buildStaffCookie({
      user_id: doctor.user_id,
      wf_id: doctor.wf_id,
      role: 'doctor',
    });
    store.set(cookie.name, cookie.value, cookie.options);
    return NextResponse.json({ ok: true, redirect: '/doctor/inbox' });
  }

  return NextResponse.json({ error: 'invalid_code' }, { status: 404 });
}
