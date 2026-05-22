'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CodeEntry() {
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
            ? 'Code not found. Check and try again.'
            : j.error === 'expired'
              ? 'This code has expired.'
              : j.error === 'revoked'
                ? 'This code has been revoked.'
                : 'Sign-in failed.',
        );
        return;
      }
      router.push(j.redirect ?? '/');
    } catch {
      setError('Network error. Try again.');
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
          placeholder="Enter your code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="text-center font-mono tracking-widest sm:flex-1"
          required
        />
        <Button type="submit" size="xl" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
    </form>
  );
}
