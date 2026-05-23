// GET /api/auth/me — returns the current staff/family session info, or 401.
// Used by client UIs to decide what to show (read-only vs edit, etc.).
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStaffSession } from '@/lib/auth/staff-session';
import { verifyFamilyCookie, FAMILY_COOKIE_NAME } from '@/lib/family/session';

export async function GET() {
  const staff = await getStaffSession();
  if (staff) {
    return NextResponse.json({
      role: staff.role,
      user_id: staff.user_id,
      wf_id: staff.wf_id,
    });
  }
  const store = await cookies();
  const fam = verifyFamilyCookie(store.get(FAMILY_COOKIE_NAME)?.value);
  if (fam) {
    return NextResponse.json({
      role: 'family',
      patient_id: fam.patient_id,
    });
  }
  return NextResponse.json({ role: null }, { status: 401 });
}
