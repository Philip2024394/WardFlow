'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Stethoscope,
  HeartPulse,
  ClipboardList,
  ShieldCheck,
  Users,
  UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/strings';
import { useToast } from '@/components/ui/toast';
import { ROLE_HOME, type UserRole } from '@/types/roles';

const ROLE_META: Array<{ id: UserRole; Icon: typeof Stethoscope }> = [
  { id: 'nurse', Icon: HeartPulse },
  { id: 'doctor', Icon: Stethoscope },
  { id: 'supervisor', Icon: ClipboardList },
  { id: 'admin', Icon: ShieldCheck },
  { id: 'reception', Icon: UserCog },
  { id: 'family', Icon: Users },
];

export function RoleSelect() {
  const router = useRouter();
  const toast = useToast();
  const { t, locale, setLocale } = useT();
  const [role, setRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role) return;
    setBusy(true);
    try {
      // Phase 0: skip real Supabase sign-in if not configured. Route to role home.
      // Phil will wire real createBrowserClient().auth.signInWithPassword once env is set.
      await new Promise((r) => setTimeout(r, 250));
      // Family goes to code entry, not the dashboard, since they have no account.
      if (role === 'family') {
        router.push('/family');
      } else {
        router.push(ROLE_HOME[role]);
      }
    } catch {
      toast.push(t.login.invalidCreds, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendMagic = async () => {
    if (!email || !role) {
      toast.push(t.login.invalidCreds, 'error');
      return;
    }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 250));
      toast.push(t.login.magicSent, 'success');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">{t.login.title}</h1>
        <p className="mt-2 text-sm text-slate-300">{t.login.subtitle}</p>
        <div className="mt-3 flex items-center justify-center gap-2 text-xs">
          <span className="text-slate-400">{t.common.language}:</span>
          <button
            onClick={() => setLocale('id')}
            className={
              locale === 'id'
                ? 'rounded px-2 py-1 bg-primary text-primary-foreground'
                : 'rounded px-2 py-1 text-slate-300'
            }
          >
            Bahasa
          </button>
          <button
            onClick={() => setLocale('en')}
            className={
              locale === 'en'
                ? 'rounded px-2 py-1 bg-primary text-primary-foreground'
                : 'rounded px-2 py-1 text-slate-300'
            }
          >
            English
          </button>
        </div>
      </div>

      <motion.div
        layout
        className="wf-glass rounded-2xl p-6 shadow-2xl"
        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
      >
        <p className="mb-3 text-sm font-medium">{t.login.pickRole}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {ROLE_META.map(({ id, Icon }) => {
            const active = role === id;
            return (
              <motion.button
                key={id}
                onClick={() => setRole(id)}
                whileTap={{ scale: 0.97 }}
                className={
                  'flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-primary bg-primary/15 text-white ring-1 ring-primary'
                    : 'border-slate-700 bg-slate-900/40 text-slate-200 hover:border-slate-500')
                }
              >
                <Icon className="h-6 w-6" aria-hidden />
                {t.roles[id]}
              </motion.button>
            );
          })}
        </div>

        {role && role !== 'family' && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email" className="text-slate-200">
                {t.login.email}
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 bg-slate-900/60 text-white"
              />
            </div>
            <div>
              <Label htmlFor="pw" className="text-slate-200">
                {t.login.password}
              </Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 bg-slate-900/60 text-white"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" size="lg" disabled={busy} className="flex-1">
                {busy ? t.login.submitting : t.login.submit}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={sendMagic}
                disabled={busy}
                className="flex-1 border-slate-600 text-slate-200 hover:bg-slate-800"
              >
                {t.login.magicLink}
              </Button>
            </div>
            <p className="text-xs text-slate-400">{t.login.noAccount}</p>
          </form>
        )}

        {role === 'family' && (
          <div className="mt-6 rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm">
            <p className="text-slate-200">{t.family.enterCode}</p>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={() => router.push('/family')}
            >
              {t.family.enter}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
