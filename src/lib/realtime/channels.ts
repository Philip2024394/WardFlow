'use client';
// Supabase Realtime channel helpers for WardFlow.
// All channels assume the client is authenticated. Channels emit raw Supabase
// realtime payloads; the calling component decides how to render them.

import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

type Unsub = () => void;

function once(channel: RealtimeChannel): Unsub {
  return () => {
    try {
      channel.unsubscribe();
    } catch {
      // ignore
    }
  };
}

// Nurse listens for handover proposals targeted at them.
export function subscribeHandoverProposals(
  nurseUserId: string,
  onChange: (payload: unknown) => void,
): Unsub {
  const sb = createSupabaseBrowserClient();
  const ch = sb
    .channel(`handover-proposals:${nurseUserId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'handover_proposal_nurses',
        filter: `nurse_user_id=eq.${nurseUserId}`,
      },
      onChange,
    )
    .subscribe();
  return once(ch);
}

// Nurse listens for doctor orders on their patients.
// We subscribe to all orders and let the client filter by assigned patient ids.
export function subscribeDoctorOrders(
  patientIds: string[],
  onChange: (payload: unknown) => void,
): Unsub {
  const sb = createSupabaseBrowserClient();
  const ch = sb
    .channel(`doctor-orders:${patientIds.slice(0, 3).join('-')}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'doctor_orders' },
      (p) => {
        const row = (p as { new?: { patient_id?: string } }).new;
        if (row?.patient_id && patientIds.includes(row.patient_id)) onChange(p);
      },
    )
    .subscribe();
  return once(ch);
}

// Hospital-wide dashboard listens to the alerts feed.
export function subscribeAlertFeed(onChange: (payload: unknown) => void): Unsub {
  const sb = createSupabaseBrowserClient();
  const ch = sb
    .channel('alerts:dashboard')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'alerts' },
      onChange,
    )
    .subscribe();
  return once(ch);
}

// Family timeline listens for new visit confirmations on their patient.
export function subscribeFamilyTimeline(
  patientId: string,
  onChange: (payload: unknown) => void,
): Unsub {
  const sb = createSupabaseBrowserClient();
  const ch = sb
    .channel(`family-timeline:${patientId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'visit_confirmations',
        filter: `patient_id=eq.${patientId}`,
      },
      onChange,
    )
    .subscribe();
  return once(ch);
}
