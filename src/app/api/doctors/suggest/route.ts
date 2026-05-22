// GET /api/doctors/suggest?intakeId=... — ranked doctor suggestion list for an ER intake.
// Calls the SQL function suggest_doctors_for_intake which never exposes standard_fee_idr.
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const intakeId = url.searchParams.get('intakeId');
  if (!intakeId) return NextResponse.json({ error: 'missing_intakeId' }, { status: 400 });

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('suggest_doctors_for_intake', { p_intake_id: intakeId });
    if (error) {
      return NextResponse.json({ error: 'rpc_failed', detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ doctors: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: 'internal', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
