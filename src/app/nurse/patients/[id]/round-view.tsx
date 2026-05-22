'use client';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { VitalsForm } from '@/components/VitalsForm';
import { EmergencyButton } from '@/components/EmergencyButton';
import { useT } from '@/lib/i18n/strings';
import { useAudit } from '@/components/AuditLogger';

interface Props {
  patientId: string;
}

export function PatientRoundView({ patientId }: Props) {
  const { t } = useT();
  const audit = useAudit();

  // Phase 0 mock patient — Supabase swap-in here.
  const patient = {
    id: patientId,
    full_name: 'Budi Santoso',
    bed_no: '12A',
    risk_level: 'green' as const,
    diagnosis: 'Pneumonia komunitas (hari ke-3)',
    allergies: ['Penisilin'],
  };

  const handleSave = async (payload: unknown) => {
    audit.log({
      action: 'patient.round.create',
      entity_type: 'patient_rounds',
      entity_id: patient.id,
      after: payload as Record<string, unknown>,
    });
    // Real impl: POST to /api/rounds or call supabase directly with RLS.
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link href="/nurse">
        <Button variant="ghost" size="sm" className="mb-3 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          {t.common.back}
        </Button>
      </Link>

      <Card className="flex items-center gap-3 p-4">
        <Avatar className="h-12 w-12">
          <AvatarFallback>BS</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{patient.full_name}</h1>
            <Badge variant="secondary">
              {t.nurse.bed} {patient.bed_no}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{patient.diagnosis}</p>
          {patient.allergies?.length ? (
            <p className="mt-1 text-xs text-red-600">
              Alergi: {patient.allergies.join(', ')}
            </p>
          ) : null}
        </div>
      </Card>

      <h2 className="mt-5 text-base font-semibold">{t.round.title}</h2>
      <div className="mt-3">
        <VitalsForm patientId={patient.id} onSave={handleSave} />
      </div>

      <EmergencyButton patientId={patient.id} />
    </div>
  );
}
