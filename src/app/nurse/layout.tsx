// Server layout — gates nurse role.
// Phase 0: if Supabase isn't configured yet, requireRole() redirects to /login.
// import { requireRole } from '@/lib/auth/role';

export default async function NurseLayout({ children }: { children: React.ReactNode }) {
  // Uncomment when Supabase is provisioned:
  // await requireRole('nurse');
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
