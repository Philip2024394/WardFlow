import { ProceduresPanel } from './panel';

export default async function PatientProceduresPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <ProceduresPanel patientId={id} />
      </div>
    </main>
  );
}
