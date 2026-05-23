// GET  /api/admin/wards — list wards + GPS config
// POST /api/admin/wards — upsert a ward (insert if no id, update if id provided)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const PostSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  floor: z.string().max(40).nullable().optional(),
  capacity: z.number().int().nonnegative().optional(),
  gps_lat: z.number().min(-90).max(90).nullable().optional(),
  gps_lng: z.number().min(-180).max(180).nullable().optional(),
  gps_radius_m: z.number().int().min(5).max(5000).nullable().optional(),
});

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('wards')
    .select('id,name,code,floor,capacity,gps_lat,gps_lng,gps_radius_m')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wards: data ?? [] });
}

export async function POST(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const supabase = createSupabaseServiceClient();

  if (parsed.data.id) {
    const { id, ...rest } = parsed.data;
    const { data, error } = await supabase
      .from('wards')
      .update({ ...rest, updated_by: session.user_id })
      .eq('id', id)
      .select('id,name,code,floor,capacity,gps_lat,gps_lng,gps_radius_m')
      .single();
    if (error) {
      return NextResponse.json(
        { error: 'update_failed', detail: error.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, ward: data });
  }

  const { data, error } = await supabase
    .from('wards')
    .insert({ ...parsed.data, created_by: session.user_id })
    .select('id,name,code,floor,capacity,gps_lat,gps_lng,gps_radius_m')
    .single();
  if (error) {
    return NextResponse.json(
      { error: 'create_failed', detail: error.message },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, ward: data });
}
