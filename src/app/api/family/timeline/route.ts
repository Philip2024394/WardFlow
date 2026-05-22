// GET /api/family/timeline — sanitized visit log for the family-portal session.
// Reads from public.family_visit_timeline view; RLS gates by family_patient_id() GUC.
// The /api/family-session middleware is expected to SET LOCAL app.family_patient_id
// for this request's connection.
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from('family_visit_timeline')
      .select(
        'visit_id,patient_id,occurred_at,nurse_name,nurse_wf_id,blood_pressure_systolic,blood_pressure_diastolic,temperature_c,heart_rate_bpm,oxygen_pct,rating,comment,is_advisory',
      )
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ visits: [], error: error.message }, { status: 200 });
    }
    return NextResponse.json({ visits: data ?? [] });
  } catch {
    return NextResponse.json({ visits: [] });
  }
}
