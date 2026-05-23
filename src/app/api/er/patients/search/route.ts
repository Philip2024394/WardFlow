// GET /api/er/patients/search?name=X&dob=YYYY-MM-DD&country=ID
// Returns matching prior-patient records with a brief history summary so the
// ER admission form can alert the admin of a returning patient.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

const Schema = z.object({
  name: z.string().min(2).max(120),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  country: z.string().max(40).optional(),
});

export async function GET(req: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const parsed = Schema.safeParse({
    name: url.searchParams.get('name') ?? '',
    dob: url.searchParams.get('dob') ?? '',
    country: url.searchParams.get('country') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ matches: [] });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc('search_returning_patients', {
    p_full_name: parsed.data.name,
    p_dob: parsed.data.dob,
    p_country: parsed.data.country ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ matches: data ?? [] });
}
