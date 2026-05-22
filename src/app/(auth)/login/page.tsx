import { Suspense } from 'react';
import { RoleSelect } from './role-select';

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_50%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_45%)]"
      />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12">
        <Suspense>
          <RoleSelect />
        </Suspense>
      </div>
    </main>
  );
}
