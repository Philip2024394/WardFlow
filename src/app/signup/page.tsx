'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Role = 'nurse' | 'doctor';

export default function SignupPage() {
  const [role, setRole] = useState<Role>('nurse');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [license, setLicense] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    login_code: string;
    wf_id: string | null;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
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

  if (result) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md">
          <Card className="border-slate-800 bg-slate-900 p-6">
            <h1 className="text-xl font-bold">Account created</h1>
            <p className="mt-3 text-sm text-slate-300">
              Your <strong>WardFlow ID</strong> (name tag):
            </p>
            <p className="mt-1 font-mono text-lg">{result.wf_id ?? '—'}</p>
            <p className="mt-4 text-sm text-slate-300">
              Your <strong>login code</strong>. Save it now — you will use this to
              sign in from the home page. It is your password.
            </p>
            <p className="mt-1 select-all rounded bg-slate-800 px-3 py-3 text-center font-mono text-2xl tracking-widest">
              {result.login_code}
            </p>
            <Link href="/" className="mt-6 block">
              <Button className="w-full" size="lg">
                Back to home
              </Button>
            </Link>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-md">
        <Card className="border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-bold">Create your WardFlow account</h1>
          <p className="mt-1 text-xs text-slate-400">
            Patients do not self-register — patient accounts are created by ER
            admin staff.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <Label>I am a</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['nurse', 'doctor'] as Role[]).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    className={`rounded-md border px-3 py-2 text-sm capitalize ${
                      role === r
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-slate-700 bg-slate-800 text-slate-200'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
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
                placeholder="+62..."
              />
            </div>

            {role === 'doctor' && (
              <div>
                <Label htmlFor="specialty">Specialty / expertise</Label>
                <Input
                  id="specialty"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="e.g. cardiology"
                />
              </div>
            )}
            <div>
              <Label htmlFor="license">License number (optional)</Label>
              <Input
                id="license"
                value={license}
                onChange={(e) => setLicense(e.target.value)}
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
            <Link
              href="/"
              className="block text-center text-xs text-slate-400 underline"
            >
              Back to home
            </Link>
          </form>
        </Card>
      </div>
    </main>
  );
}
