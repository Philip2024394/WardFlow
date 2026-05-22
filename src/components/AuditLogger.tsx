'use client';
// Client-side audit context. Posts batched events to /api/audit.
// Server components should call lib/audit/log.ts directly.
import * as React from 'react';

export interface ClientAuditEvent {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  after?: Record<string, unknown> | null;
}

interface Ctx {
  log: (e: ClientAuditEvent) => void;
}

const AuditCtx = React.createContext<Ctx | null>(null);

export function useAudit() {
  const ctx = React.useContext(AuditCtx);
  if (!ctx) throw new Error('useAudit must be used inside <AuditLogger>');
  return ctx;
}

export function AuditLogger({ children }: { children: React.ReactNode }) {
  const log = React.useCallback((e: ClientAuditEvent) => {
    // Fire and forget. Server logs even if this fails (defense in depth).
    void fetch('/api/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...e,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
      keepalive: true,
    }).catch(() => {
      /* swallow */
    });
  }, []);
  return <AuditCtx.Provider value={{ log }}>{children}</AuditCtx.Provider>;
}
