import { PatientRoundView } from './round-view';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NursePatientPage({ params }: Props) {
  const { id } = await params;
  return <PatientRoundView patientId={id} />;
}
