'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, MessageCircle, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/strings';
import { useToast } from '@/components/ui/toast';

type Section = 'care_rounds' | 'medications' | 'doctor_notes' | 'emergency_info';
type Relationship = 'spouse' | 'parent' | 'child' | 'sibling' | 'other';

interface ActiveCode {
  id: string;
  code: string;
  expires_at: string;
}

interface Props {
  patientId: string;
}

const SECTIONS: Section[] = ['care_rounds', 'medications', 'doctor_notes', 'emergency_info'];

const SECTION_LABEL_KEY: Record<Section, 'careRounds' | 'medications' | 'doctorNotes' | 'emergencyInfo'> = {
  care_rounds: 'careRounds',
  medications: 'medications',
  doctor_notes: 'doctorNotes',
  emergency_info: 'emergencyInfo',
};

export function ShareWithFamilyPanel({ patientId }: Props) {
  const { t } = useT();
  const toast = useToast();
  const [familyName, setFamilyName] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('spouse');
  const [selected, setSelected] = useState<Section[]>(['care_rounds', 'emergency_info']);
  const [expiry, setExpiry] = useState<'d1' | 'd7' | 'd30'>('d7');
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ code: string; expiresAt: string } | null>(
    null
  );
  const [active, setActive] = useState<ActiveCode[]>([]);

  useEffect(() => {
    // Soft-load active codes; ignore network errors for Phase 0 demo.
    void fetch(`/api/family-codes?patientId=${patientId}`)
      .then((r) => (r.ok ? r.json() : { codes: [] }))
      .then((d) => setActive(d.codes ?? []))
      .catch(() => setActive([]));
  }, [patientId]);

  const toggleSection = (s: Section) =>
    setSelected((curr) => (curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s]));

  const ttlDays = expiry === 'd1' ? 1 : expiry === 'd7' ? 7 : 30;

  const handleGenerate = async () => {
    if (selected.length === 0) {
      toast.push(t.common.error, 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/family-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          family_name: familyName,
          relationship,
          allowed_sections: selected,
          ttl_days: ttlDays,
        }),
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { code: string; expiresAt: string; id: string };
      setGenerated({ code: data.code, expiresAt: data.expiresAt });
      setActive((curr) => [
        ...curr,
        { id: data.id, code: data.code, expires_at: data.expiresAt },
      ]);
      toast.push(t.common.success, 'success');
    } catch {
      toast.push(t.toasts.networkError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (code: string) => {
    try {
      const res = await fetch(`/api/family-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('failed');
      setActive((curr) => curr.filter((c) => c.code !== code));
      toast.push(t.common.success, 'success');
    } catch {
      toast.push(t.toasts.networkError, 'error');
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push(t.common.copied, 'success');
    } catch {
      toast.push(t.common.error, 'error');
    }
  };

  const whatsappHref = (code: string) => {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/family`;
    const msg =
      `${t.family.portalTitle}\n` +
      `${t.family.enterCode}: ${code}\n` +
      url;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-base font-semibold">{t.share.title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t.family.readOnlyNotice}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label htmlFor="fname">{t.share.familyName}</Label>
          <Input
            id="fname"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="rel">{t.share.relationship}</Label>
          <select
            id="rel"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as Relationship)}
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(t.share.relOptions).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="exp">{t.share.expiry}</Label>
          <select
            id="exp"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as 'd1' | 'd7' | 'd30')}
            className="mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(t.share.expiryOptions).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>{t.share.sections}</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SECTIONS.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(s)}
                onChange={() => toggleSection(s)}
                className="h-4 w-4"
              />
              {t.family[SECTION_LABEL_KEY[s]]}
            </label>
          ))}
        </div>
      </div>

      <Button onClick={handleGenerate} disabled={busy} className="w-full">
        {busy ? t.common.saving : t.share.generate}
      </Button>

      {generated && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground">{t.share.generated}</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <code className="text-base font-bold tracking-wider">{generated.code}</code>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => copyCode(generated.code)}>
                <Copy className="h-4 w-4" />
                {t.common.copy}
              </Button>
              <a href={whatsappHref(generated.code)} target="_blank" rel="noreferrer">
                <Button size="sm">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
              </a>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t.share.expires}: {new Date(generated.expiresAt).toLocaleString()}
          </p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold">{t.share.active}</h3>
        {active.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t.share.noActive}</p>
        ) : (
          <div className="mt-2 divide-y rounded-md border">
            {active.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3">
                <div>
                  <code className="text-sm font-semibold">{c.code}</code>
                  <p className="text-xs text-muted-foreground">
                    {t.share.expires}: {new Date(c.expires_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRevoke(c.code)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t.common.revoke}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
