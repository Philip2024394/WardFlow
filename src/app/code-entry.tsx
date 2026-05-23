'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Labels {
  placeholder: string;
  submit: string;
  submitting: string;
  errorInvalid: string;
  errorExpired: string;
  errorRevoked: string;
  errorOther: string;
  errorNetwork: string;
}

const DEFAULT_LABELS: Labels = {
  placeholder: 'Enter your code',
  submit: 'Sign in',
  submitting: 'Signing in…',
  errorInvalid: 'Code not found. Check and try again.',
  errorExpired: 'This code has expired.',
  errorRevoked: 'This code has been revoked.',
  errorOther: 'Sign-in failed.',
  errorNetwork: 'Network error. Try again.',
};

export function CodeEntry({ labels = DEFAULT_LABELS }: { labels?: Labels }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          j.error === 'invalid_code'
            ? labels.errorInvalid
            : j.error === 'expired'
              ? labels.errorExpired
              : j.error === 'revoked'
                ? labels.errorRevoked
                : labels.errorOther,
        );
        return;
      }
      router.push(j.redirect ?? '/');
    } catch {
      setError(labels.errorNetwork);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-8 max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={labels.placeholder}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="text-center font-mono tracking-widest sm:flex-1"
          required
        />
        <Button type="submit" size="xl" disabled={busy}>
          {busy ? labels.submitting : labels.submit}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </form>
  );
}
