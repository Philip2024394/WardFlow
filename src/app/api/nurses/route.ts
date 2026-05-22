// GET  /api/nurses              — list/search nurses (admin/supervisor/doctor/ER staff)
//                                 ?q=…  ?onShift=1  ?wardId=…
// POST /api/nurses              — admin creates a nurse account
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/log';

const CreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
  age: z.number().int().min(16).max(120).optional(),
  gender: z.enum(['M', 'F', 'X']).optional(),
  home_address: z.string().max(500).optional(),
  whatsapp_e164: z.string().regex(/^\+\d{6,15}$/).optional(),
  emergency_contact: z
    .object({
      name: z.string().min(1).max(120),
      relationship: z.string().max(40).optional(),
      phone_e164: z.string().regex(/^\+\d{6,15}$/).optional(),
    })
    .optional(),
  years_experience: z.number().min(0).max(60).optional(),
  specialization: z.string().max(120).optional(),
  shift_type: z.enum(['day', 'night', 'rotating']).optional(),
  languages: z.array(z.string().min(1).max(40)).max(10).optional(),
  employment_start_date: z.string().optional(),
  license_no: z.string().max(60).optional(),
  assigned_ward_ids: z.array(z.string().uuid()).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const onShift = url.searchParams.get('onShift') === '1';
  const wardId = url.searchParams.get('wardId');

  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from('nurses')
      .select(
        'user_id,wf_id,assigned_ward_ids,shift_start_at,shift_end_at,license_no,years_experience,specialization,shift_type,is_online,last_seen_at,compliance_score,users(full_name,email,phone_e164,photo_url)',
      )
      .limit(50);

    if (onShift) {
      query = query.not('shift_start_at', 'is', null).is('shift_end_at', null);
    }
    if (wardId) {
      // assigned_ward_ids is uuid[]; @> checks containment.
      query = query.contains('assigned_ward_ids', [wardId]);
    }

    const { data, error } = await query;
    if (error) throw error;

    let rows = data ?? [];
    if (q) {
      const lc = q.toLowerCase();
      rows = rows.filter((r) => {
        const u = (r as { users?: { full_name?: string; email?: string } }).users;
        return (
          (u?.full_name || '').toLowerCase().includes(lc) ||
          (u?.email || '').toLowerCase().includes(lc) ||
          ((r as { wf_id?: string }).wf_id || '').toLowerCase().includes(lc) ||
          ((r as { specialization?: string }).specialization || '').toLowerCase().includes(lc)
        );
      });
    }
    return NextResponse.json({ nurses: rows });
  } catch {
    return NextResponse.json({ nurses: [] });
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = CreateSchema.safeParse(body);
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

    // Only admin or supervisor can create staff accounts. The role check is via RLS too,
    // but we short-circuit here with a friendlier error.
    const { data: meRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!meRow || !['admin', 'supervisor'].includes(meRow.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    // Service client for the auth.users provisioning step (anon key can't create users).
    const svc = createSupabaseServiceClient();
    const { data: created, error: authErr } = await svc.auth.admin.createUser({
      email: parsed.data.email,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name, role: 'nurse' },
    });
    if (authErr || !created.user) {
      return NextResponse.json(
        { error: 'auth_create_failed', detail: authErr?.message },
        { status: 500 },
      );
    }

    // Insert public.users — trigger sync_user_role_extension will mirror into nurses + assign wf_id.
    const { error: usrErr } = await svc.from('users').insert({
      id: created.user.id,
      email: parsed.data.email,
      full_name: parsed.data.full_name,
      role: 'nurse',
      phone_e164: parsed.data.whatsapp_e164 ?? null,
    });
    if (usrErr) {
      return NextResponse.json({ error: 'users_insert_failed', detail: usrErr.message }, { status: 500 });
    }

    // Fill the identity fields the trigger doesn't know about.
    const { data: nurseRow, error: nurseErr } = await svc
      .from('nurses')
      .update({
        age: parsed.data.age ?? null,
        gender: parsed.data.gender ?? null,
        home_address: parsed.data.home_address ?? null,
        whatsapp_e164: parsed.data.whatsapp_e164 ?? null,
        emergency_contact: parsed.data.emergency_contact ?? null,
        years_experience: parsed.data.years_experience ?? null,
        specialization: parsed.data.specialization ?? null,
        shift_type: parsed.data.shift_type ?? null,
        languages: parsed.data.languages ?? [],
        employment_start_date: parsed.data.employment_start_date ?? null,
        license_no: parsed.data.license_no ?? null,
        assigned_ward_ids: parsed.data.assigned_ward_ids ?? [],
      })
      .eq('user_id', created.user.id)
      .select('user_id,wf_id')
      .maybeSingle();
    if (nurseErr) {
      return NextResponse.json({ error: 'nurses_update_failed', detail: nurseErr.message }, { status: 500 });
    }

    await logAuditEvent({
      action: 'nurse.create',
      entity_type: 'nurses',
      entity_id: created.user.id,
      after: { wf_id: nurseRow?.wf_id, email: parsed.data.email },
    });

    return NextResponse.json({ user_id: created.user.id, wf_id: nurseRow?.wf_id });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
