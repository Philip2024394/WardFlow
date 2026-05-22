import { DoctorPatientView } from './detail-view';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DoctorPatientPage({ params }: Props) {
  const { id } = await params;
  return <DoctorPatientView patientId={id} />;
}
