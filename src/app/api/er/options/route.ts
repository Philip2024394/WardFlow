// GET /api/er/options — returns wards + doctors lists for the ER new-patient form.
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getStaffSession } from '@/lib/auth/staff-session';

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const supabase = createSupabaseServiceClient();

  const [{ data: wards }, { data: doctors }] = await Promise.all([
    supabase.from('wards').select('id,name,code,floor').order('name'),
    supabase
      .from('doctors')
      .select('user_id,wf_id,specialty,is_online,users!inner(full_name)')
      .order('wf_id'),
  ]);

  type DoctorRow = {
    user_id: string;
    wf_id: string;
    specialty: string | null;
    is_online: boolean | null;
    users: { full_name: string } | { full_name: string }[];
  };

  const flatDoctors = (doctors as DoctorRow[] | null)?.map((d) => ({
    user_id: d.user_id,
    wf_id: d.wf_id,
    specialty: d.specialty,
    is_online: !!d.is_online,
    full_name: Array.isArray(d.users) ? d.users[0]?.full_name : d.users?.full_name,
  })) ?? [];

  return NextResponse.json({ wards: wards ?? [], doctors: flatDoctors });
}
