// POST /api/auth/signup — nurse/doctor self-registration. Creates auth user +
// public.users row (which fires the sync_user_role_extension trigger that
// auto-creates the nurses/doctors row with wf_id). Then sets a random login_code.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const Schema = z.object({
  role: z.enum(['nurse', 'doctor']),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  phone_e164: z.string().max(32).optional(),
  specialty: z.string().max(120).optional(),
  license_no: z.string().max(64).optional(),
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
  const { role, full_name, email, phone_e164, specialty, license_no } = parsed.data;

  const supabase = createSupabaseServiceClient();

  const randomPw = randomBytes(24).toString('hex');
  const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
    email,
    password: randomPw,
    email_confirm: true,
    user_metadata: { full_name, role },
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
    email,
    full_name,
    role,
    phone_e164,
    created_by: userId,
  });
  if (userErr) {
    // Roll back the auth user so the email can be reused.
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return NextResponse.json(
      { error: 'user_insert_failed', detail: userErr.message },
      { status: 400 },
    );
  }

  // Generate the login_code via the DB function so retries on collision are server-side.
  const { data: codeData, error: codeErr } = await supabase.rpc('generate_login_code');
  if (codeErr || typeof codeData !== 'string') {
    return NextResponse.json(
      { error: 'code_gen_failed', detail: codeErr?.message },
      { status: 500 },
    );
  }
  const loginCode = codeData;

  if (role === 'nurse') {
    const { error } = await supabase
      .from('nurses')
      .update({ login_code: loginCode })
      .eq('user_id', userId);
    if (error) {
      return NextResponse.json(
        { error: 'nurse_code_set_failed', detail: error.message },
        { status: 500 },
      );
    }
  } else {
    const updates: Record<string, unknown> = { login_code: loginCode };
    if (specialty) updates.specialty = specialty;
    if (license_no) updates.license_no = license_no;
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
    .from(role === 'nurse' ? 'nurses' : 'doctors')
    .select('wf_id')
    .eq('user_id', userId)
    .single();

  return NextResponse.json({
    ok: true,
    login_code: loginCode,
    wf_id: (roleRow as { wf_id?: string } | null)?.wf_id ?? null,
    role,
  });
}
