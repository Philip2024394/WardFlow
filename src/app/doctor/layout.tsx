// Server layout — gates doctor role.
// import { requireRole } from '@/lib/auth/role';

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  // await requireRole('doctor');
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
