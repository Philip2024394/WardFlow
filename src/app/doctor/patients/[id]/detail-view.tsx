'use client';
import Link from 'next/link';
import { ArrowLeft, LineChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShareWithFamilyPanel } from '@/components/ShareWithFamilyPanel';
import { useT } from '@/lib/i18n/strings';

export function DoctorPatientView({ patientId }: { patientId: string }) {
  const { t } = useT();

  const patient = {
    id: patientId,
    full_name: 'Budi Santoso',
    bed_no: '12A',
    diagnosis: 'Pneumonia komunitas (hari ke-3)',
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/doctor">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {t.common.back}
        </Button>
      </Link>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">{patient.full_name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{patient.diagnosis}</p>
            <Badge variant="secondary" className="mt-2">
              {t.nurse.bed} {patient.bed_no}
            </Badge>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">{t.doctor.trends}</h2>
          </div>
          <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
            {t.doctor.trendsPlaceholder}
          </div>
        </Card>

        <ShareWithFamilyPanel patientId={patient.id} />
      </div>
    </div>
  );
}
