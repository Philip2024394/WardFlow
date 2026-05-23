// POST /api/auth/signup — nurse/doctor self-registration. Creates auth user +
// public.users row (which fires the sync_user_role_extension trigger that
// auto-creates the nurses/doctors row with wf_id). Then sets a random login_code.
//
// Doctor signup additionally captures specialty_keywords, shift_pattern,
// languages, and expertise so the suggest_doctors_for_intake() function has
// good data to rank on.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const Schema = z.object({
  role: z.enum(['nurse', 'doctor']),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone_e164: z.string().max(32).optional(),
  // doctor-only fields
  specialty: z.string().max(120).optional(),
  license_no: z.string().max(64).optional(),
  specialty_keywords: z.array(z.string().max(60)).max(40).optional(),
  expertise: z.string().max(2000).optional(),
  languages: z.array(z.string().max(40)).max(20).optional(),
  working_days: z.array(z.enum(WEEKDAYS)).max(7).optional(),
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
  const v = parsed.data;
  const supabase = createSupabaseServiceClient();

  const randomPw = randomBytes(24).toString('hex');
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email: v.email,
    password: randomPw,
    email_confirm: true,
    user_metadata: { full_name: v.full_name, role: v.role },
  });
  if (authErr || !authData?.user) {
    return NextResponse.json(
      { error: 'auth_create_failed', detail: authErr?.message },
      { status: 400 },
    );
  }
  const userId = authData.user.id;

  const { error: userErr } = await supabase.from('users').insert({
    id: userId,
    email: v.email,
    full_name: v.full_name,
    role: v.role,
    phone_e164: v.phone_e164,
    created_by: userId,
  });
  if (userErr) {
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json(
      { error: 'user_insert_failed', detail: userErr.message },
      { status: 400 },
    );
  }

  const { data: codeData, error: codeErr } = await supabase.rpc('generate_login_code');
  if (codeErr || typeof codeData !== 'string') {
    return NextResponse.json(
      { error: 'code_gen_failed', detail: codeErr?.message },
      { status: 500 },
    );
  }
  const loginCode = codeData;

  if (v.role === 'nurse') {
    const updates: Record<string, unknown> = { login_code: loginCode };
    if (v.languages && v.languages.length) updates.languages = v.languages;
    const { error } = await supabase
      .from('nurses')
      .update(updates)
      .eq('user_id', userId);
    if (error) {
      return NextResponse.json(
        { error: 'nurse_code_set_failed', detail: error.message },
        { status: 500 },
      );
    }
  } else {
    const updates: Record<string, unknown> = { login_code: loginCode };
    if (v.specialty) updates.specialty = v.specialty;
    if (v.license_no) updates.license_no = v.license_no;
    if (v.specialty_keywords && v.specialty_keywords.length) {
      updates.specialty_keywords = v.specialty_keywords;
    }
    if (v.expertise) updates.expertise = v.expertise;
    if (v.languages && v.languages.length) updates.languages = v.languages;
    if (v.working_days && v.working_days.length) {
      const sp: Record<string, string> = {};
      for (const d of v.working_days) sp[d] = 'on';
      updates.shift_pattern = sp;
    }
    const { error } = await supabase
      .from('doctors')
      .update(updates)
      .eq('user_id', userId);
    if (error) {
      return NextResponse.json(
        { error: 'doctor_code_set_failed', detail: error.message },
        { status: 500 },
      );
    }
  }

  const { data: roleRow } = await supabase
    .from(v.role === 'nurse' ? 'nurses' : 'doctors')
    .select('wf_id')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    ok: true,
    login_code: loginCode,
    wf_id: (roleRow as { wf_id?: string } | null)?.wf_id ?? null,
    role: v.role,
  });
}
