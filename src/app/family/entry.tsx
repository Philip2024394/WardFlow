'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n/strings';
import { useToast } from '@/components/ui/toast';

export function FamilyEntry() {
  const { t } = useT();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/family-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      if (!res.ok) {
        toast.push(t.family.invalidCode, 'error');
        return;
      }
      router.push('/family/view');
    } catch {
      toast.push(t.toasts.networkError, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6">
        <h1 className="text-lg font-bold">{t.family.portalTitle}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t.family.readOnlyNotice}</p>
        <form onSubmit={handle} className="mt-5 space-y-3">
          <Label htmlFor="code">{t.family.enterCode}</Label>
          <Input
            id="code"
            placeholder={t.family.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            required
          />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? t.common.loading : t.family.enter}
          </Button>
        </form>
      </Card>
    </div>
  );
}
