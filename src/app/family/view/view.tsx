'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LogOut, HeartPulse, Pill, FileText, Phone } from 'lucide-react';
import { useT } from '@/lib/i18n/strings';

type Section = 'care_rounds' | 'medications' | 'doctor_notes' | 'emergency_info';

interface Props {
  code: string;
  patientId: string;
  allowedSections: Section[];
}

export function FamilyView({ code, patientId, allowedSections }: Props) {
  const { t } = useT();
  const router = useRouter();

  useEffect(() => {
    // Log read on mount.
    void fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'family.portal.view',
        entity_type: 'family_access_log',
        entity_id: code,
        after: { sections_viewed: allowedSections, patient_id: patientId },
      }),
      keepalive: true,
    }).catch(() => {});
  }, [code, patientId, allowedSections]);

  const signOut = async () => {
    await fetch('/api/family-session', { method: 'DELETE' }).catch(() => {});
    router.push('/family');
  };

  const has = (s: Section) => allowedSections.includes(s);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              WardFlow
            </p>
            <h1 className="text-lg font-bold">{t.family.viewTitle}</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            {t.family.signOut}
          </Button>
        </header>

        <Card className="mt-4 p-4">
          <p className="text-sm font-medium">Budi Santoso</p>
          <p className="text-xs text-muted-foreground">
            {t.nurse.bed} 12A • Bangsal Mawar 3
          </p>
          <Badge variant="outline" className="mt-2">
            Risiko: Hijau
          </Badge>
        </Card>

        <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
          {t.family.readOnlyNotice}
        </p>

        <div className="mt-5 space-y-4">
          <SectionCard
            allowed={has('care_rounds')}
            title={t.family.careRounds}
            Icon={HeartPulse}
            fallback={t.family.noAccessToSection}
          >
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Waktu</th>
                  <th className="text-left">TD</th>
                  <th className="text-left">Suhu</th>
                  <th className="text-left">SpO₂</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ['08:00', '118/76', '36.7', '98%'],
                  ['10:00', '120/78', '36.8', '97%'],
                  ['12:00', '122/80', '36.9', '98%'],
                ].map((row) => (
                  <tr key={row[0]}>
                    {row.map((c) => (
                      <td key={c} className="py-1.5">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <SectionCard
            allowed={has('medications')}
            title={t.family.medications}
            Icon={Pill}
            fallback={t.family.noAccessToSection}
          >
            <ul className="space-y-2 text-sm">
              <li className="rounded-md border p-3">
                <p className="font-medium">Amoxicillin 500mg</p>
                <p className="text-xs text-muted-foreground">Oral · 3x sehari</p>
              </li>
              <li className="rounded-md border p-3">
                <p className="font-medium">Paracetamol 500mg</p>
                <p className="text-xs text-muted-foreground">Oral · jika perlu</p>
              </li>
            </ul>
          </SectionCard>

          <SectionCard
            allowed={has('doctor_notes')}
            title={t.family.doctorNotes}
            Icon={FileText}
            fallback={t.family.noAccessToSection}
          >
            <p className="text-sm leading-relaxed">
              Kondisi membaik. Demam turun. Lanjutkan antibiotik. Evaluasi ulang besok pagi.
            </p>
          </SectionCard>

          <SectionCard
            allowed={has('emergency_info')}
            title={t.family.emergencyInfo}
            Icon={Phone}
            fallback={t.family.noAccessToSection}
          >
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Bangsal:</span> +62 21 555 1234
              </p>
              <p>
                <span className="text-muted-foreground">Perawat penanggung jawab:</span>{' '}
                Ners. Wati
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}

interface SectionCardProps {
  allowed: boolean;
  title: string;
  Icon: typeof HeartPulse;
  fallback: string;
  children: React.ReactNode;
}

function SectionCard({ allowed, title, Icon, fallback, children }: SectionCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {allowed ? children : (
        <p className="text-xs text-muted-foreground">{fallback}</p>
      )}
    </Card>
  );
}
