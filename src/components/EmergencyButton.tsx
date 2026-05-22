'use client';
import { motion } from 'framer-motion';
import { Siren } from 'lucide-react';
import { useT } from '@/lib/i18n/strings';
import { useToast } from '@/components/ui/toast';

interface Props {
  patientId?: string;
  onTrigger?: (patientId?: string) => void;
}

export function EmergencyButton({ patientId, onTrigger }: Props) {
  const { t } = useT();
  const toast = useToast();
  const handle = () => {
    const ok = window.confirm(t.nurse.emergencyConfirm);
    if (!ok) return;
    onTrigger?.(patientId);
    toast.push(t.nurse.emergency + ' — ' + t.common.success, 'error');
  };
  return (
    <motion.button
      onClick={handle}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      className="fixed bottom-6 right-6 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-2xl ring-4 ring-red-300/40 focus:outline-none focus:ring-red-300"
      aria-label={t.nurse.emergency}
    >
      <Siren className="h-7 w-7" aria-hidden />
      <span className="sr-only">{t.nurse.emergency}</span>
    </motion.button>
  );
}
