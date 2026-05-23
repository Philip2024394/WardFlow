'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Stethoscope, Activity, Check } from 'lucide-react';

type Role = 'nurse' | 'doctor';

const SPECIALTY_KEYWORDS: { key: string; label: string }[] = [
  { key: 'chest_pain', label: 'Chest pain' },
  { key: 'breathing_difficulty', label: 'Breathing difficulty' },
  { key: 'abdominal_pain', label: 'Abdominal pain' },
  { key: 'head_trauma', label: 'Head trauma' },
  { key: 'fracture', label: 'Fracture' },
  { key: 'burns', label: 'Burns' },
  { key: 'bleeding', label: 'Bleeding / trauma' },
  { key: 'pregnancy', label: 'Pregnancy / OB' },
  { key: 'pediatric', label: 'Pediatric' },
  { key: 'psychiatric', label: 'Psychiatric' },
  { key: 'overdose', label: 'Overdose / poisoning' },
  { key: 'allergic_reaction', label: 'Allergic reaction' },
];

const WEEKDAYS: { key: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'; label: string }[] = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

type Weekday = (typeof WEEKDAYS)[number]['key'];

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'id', label: 'Indonesian' },
  { code: 'en', label: 'English' },
  { code: 'jv', label: 'Javanese' },
  { code: 'su', label: 'Sundanese' },
  { code: 'zh', label: 'Mandarin' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'es', label: 'Spanish' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
];

export default function SignupPage() {
  const [role, setRole] = useState<Role>('nurse');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [license, setLicense] = useState('');
  const [specKeywords, setSpecKeywords] = useState<Set<string>>(new Set());
  const [expertise, setExpertise] = useState('');
  const [langCodes, setLangCodes] = useState<Set<string>>(new Set(['id', 'en']));
  const [customLang, setCustomLang] = useState('');
  const [workingDays, setWorkingDays] = useState<Set<Weekday>>(
    new Set(['mon', 'tue', 'wed', 'thu', 'fri']),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ login_code: string; wf_id: string | null } | null>(null);

  const customLangList = useMemo(
    () =>
      customLang
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [customLang],
  );

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const allLanguages = [...Array.from(langCodes), ...customLangList];
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          full_name: fullName.trim(),
          email: email.trim(),
          phone_e164: phone.trim() || undefined,
          specialty:
            role === 'doctor' ? specialty.trim() || undefined : undefined,
          license_no: license.trim() || undefined,
          specialty_keywords:
            role === 'doctor' && specKeywords.size > 0
              ? Array.from(specKeywords)
              : undefined,
          expertise: role === 'doctor' ? expertise.trim() || undefined : undefined,
          languages: allLanguages.length > 0 ? allLanguages : undefined,
          working_days:
            role === 'doctor' && workingDays.size > 0
              ? Array.from(workingDays)
              : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.detail ?? j.error ?? 'Signup failed.');
        return;
      }
      setResult({ login_code: j.login_code, wf_id: j.wf_id });
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) return <SuccessScreen result={result} />;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Create your WardFlow account</h1>
          <p className="mt-2 text-sm text-slate-400">
            Code-based sign-in. No password. You will receive a personal login
            code that you use from the home page.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Patients do not self-register — patient accounts are created by ER admin staff.
          </p>
        </header>

        <form onSubmit={submit} className="space-y-6">
          {/* Role */}
          <Card className="border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              1. Your role
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RoleCard
                active={role === 'nurse'}
                onClick={() => setRole('nurse')}
                icon={<Stethoscope className="h-7 w-7" />}
                title="Nurse"
                desc="Rounds, vitals, bedside scans, handovers."
              />
              <RoleCard
                active={role === 'doctor'}
                onClick={() => setRole('doctor')}
                icon={<Activity className="h-7 w-7" />}
                title="Doctor"
                desc="Orders, procedures, remote monitoring."
              />
            </div>
          </Card>

          {/* Identity */}
          <Card className="border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              2. About you
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="full_name">Full name *</Label>
                <Input
                  id="full_name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+62 …"
                />
              </div>
            </div>
          </Card>

          {/* Languages */}
          <Card className="border-slate-800 bg-slate-900/70 p-6">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              3. Languages you speak
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Helps match you to patients who speak the same language.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LANGUAGES.map((l) => {
                const on = langCodes.has(l.code);
                return (
                  <button
                    type="button"
                    key={l.code}
                    onClick={() => setLangCodes((s) => toggleSet(s, l.code))}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                      on
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {on && <Check className="h-3 w-3" />}
                    {l.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <Label htmlFor="customLang">Other languages (comma-separated)</Label>
              <Input
                id="customLang"
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                placeholder="Madurese, Balinese, …"
              />
            </div>
          </Card>

          {/* Doctor profile */}
          {role === 'doctor' && (
            <Card className="border-slate-800 bg-slate-900/70 p-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                4. Doctor profile
              </h2>
              <div className="mt-3 space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <Label htmlFor="specialty">Primary specialty</Label>
                    <Input
                      id="specialty"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      placeholder="e.g. cardiology, internal medicine"
                    />
                  </div>
                  <div>
                    <Label htmlFor="license">License number (optional)</Label>
                    <Input
                      id="license"
                      value={license}
                      onChange={(e) => setLicense(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Conditions you handle</Label>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Used by auto-suggest to match you to ER intake symptoms.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SPECIALTY_KEYWORDS.map((k) => {
                      const on = specKeywords.has(k.key);
                      return (
                        <button
                          type="button"
                          key={k.key}
                          onClick={() =>
                            setSpecKeywords((s) => toggleSet(s, k.key))
                          }
                          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label htmlFor="expertise">Expertise (free text)</Label>
                  <textarea
                    id="expertise"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    placeholder="e.g. interventional cardiology, 12y ICU, paediatric resuscitation"
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <Label>Working days</Label>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    On-shift days rank higher in auto-suggest.
                  </p>
                  <div className="mt-2 grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((d) => {
                      const on = workingDays.has(d.key);
                      return (
                        <button
                          type="button"
                          key={d.key}
                          onClick={() =>
                            setWorkingDays((s) => toggleSet(s, d.key))
                          }
                          className={`min-h-[44px] rounded-md border text-xs font-semibold transition ${
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {error && (
            <Card className="border-rose-800 bg-rose-950/50 p-3">
              <p className="text-sm text-rose-300">{error}</p>
            </Card>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Link href="/" className="order-2 sm:order-1">
              <Button type="button" variant="outline" size="lg" className="w-full sm:w-auto">
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              size="lg"
              className="order-1 w-full sm:order-2 sm:w-auto sm:min-w-[200px]"
              disabled={busy || !fullName.trim() || !email.trim()}
            >
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[110px] items-start gap-4 rounded-lg border p-4 text-left transition ${
        active
          ? 'border-primary bg-primary/10 ring-1 ring-primary'
          : 'border-slate-700 bg-slate-800/60 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${
          active ? 'bg-primary text-primary-foreground' : 'bg-slate-700/60 text-slate-200'
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-slate-400">{desc}</span>
      </span>
    </button>
  );
}

function SuccessScreen({
  result,
}: {
  result: { login_code: string; wf_id: string | null };
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md">
        <Card className="border-slate-800 bg-slate-900/70 p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Check className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold">Account created</h1>
          </div>

          <section className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Your WardFlow ID
            </p>
            <p className="mt-1 font-mono text-lg">{result.wf_id ?? '—'}</p>
            <p className="mt-1 text-xs text-slate-400">
              Shown to colleagues as your name tag. Does not change.
            </p>
          </section>

          <section className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Your login code
            </p>
            <p className="mt-2 select-all rounded-md bg-slate-800 px-3 py-3 text-center font-mono text-2xl tracking-widest text-emerald-300">
              {result.login_code}
            </p>
            <p className="mt-2 text-xs text-amber-300">
              Save this code now — it acts as your password. We do not show it
              again.
            </p>
          </section>

          <Link href="/" className="mt-6 block">
            <Button className="w-full" size="lg">
              Go to home & sign in
            </Button>
          </Link>
        </Card>
      </div>
    </main>
  );
}
