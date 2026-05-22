import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { FAMILY_COOKIE_NAME, verifyFamilyCookie } from '@/lib/family/session';
import { FamilyView } from './view';

export default async function FamilyViewPage() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FAMILY_COOKIE_NAME)?.value;
  const payload = verifyFamilyCookie(raw);
  if (!payload) redirect('/family');

  // Phase 0: render with the section flags + patientId from cookie.
  // Real impl: server-side fetch the patient row + allowed children, gated by RLS
  // (set `app.family_patient_id` GUC before SELECT).
  return (
    <FamilyView
      code={payload.code}
      patientId={payload.patient_id}
      allowedSections={payload.allowed_sections as Array<
        'care_rounds' | 'medications' | 'doctor_notes' | 'emergency_info'
      >}
    />
  );
}
