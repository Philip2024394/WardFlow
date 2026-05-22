'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, riskColorClass, formatRelativeTime } from '@/lib/utils';
import type { Patient, RiskLevel } from '@/types/database';
import { useT } from '@/lib/i18n/strings';

interface Props {
  patient: Pick<Patient, 'id' | 'full_name' | 'photo_url' | 'bed_no' | 'risk_level'>;
  lastRoundAt?: string | null;
  href?: string;
}

export function PatientCard({ patient, lastRoundAt, href }: Props) {
  const { t, locale } = useT();
  const initials = patient.full_name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const content = (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
    >
      <Card className="flex items-center gap-3 p-3 hover:border-primary/50 hover:shadow-md">
        <Avatar className="h-12 w-12">
          {patient.photo_url ? (
            <AvatarImage src={patient.photo_url} alt={patient.full_name} />
          ) : (
            <AvatarFallback>{initials}</AvatarFallback>
          )}
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-label={`risk:${patient.risk_level}`}
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                riskColorClass(patient.risk_level as RiskLevel)
              )}
            />
            <p className="truncate text-sm font-semibold">{patient.full_name}</p>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.nurse.bed} {patient.bed_no}
            {lastRoundAt && (
              <>
                {' • '}
                {t.nurse.lastRound} {formatRelativeTime(lastRoundAt, locale)}
              </>
            )}
          </p>
        </div>
      </Card>
    </motion.div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
