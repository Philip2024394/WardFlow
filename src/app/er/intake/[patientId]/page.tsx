// ER triage intake — captures the report and surfaces ranked doctor suggestions inline.
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IntakeForm, type PatientLite } from './form';

export const dynamic = 'force-dynamic';

async function loadPatient(id: string): Promise<PatientLite | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('patients')
      .select('id,full_name,dob,gender,allergies')
      .eq('id', id)
      .maybeSingle();
    return (data as PatientLite | null) ?? null;
  } catch {
    return null;
  }
}

export default async function IntakePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  const patient = await loadPatient(patientId);
  if (!patient) notFound();
  return <IntakeForm patient={patient} />;
}
