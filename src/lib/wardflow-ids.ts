// WardFlow staff IDs: WF-{NUR|DOC|SUP}-NNNNNN. Source of truth is Postgres
// sequences in migration 0004 — this module only parses/formats client-side.

export const WF_ID_REGEX = /^WF-(NUR|DOC|SUP)-\d{6}$/;

export type WfRolePrefix = 'NUR' | 'DOC' | 'SUP';

export interface ParsedWfId {
  ok: boolean;
  prefix?: WfRolePrefix;
  number?: number;
  raw: string;
}

export function parseWfId(raw: string): ParsedWfId {
  if (!WF_ID_REGEX.test(raw)) return { ok: false, raw };
  const [, prefix, num] = raw.match(/^WF-(NUR|DOC|SUP)-(\d{6})$/)!;
  return { ok: true, prefix: prefix as WfRolePrefix, number: Number(num), raw };
}

export function formatWfId(prefix: WfRolePrefix, n: number): string {
  return `WF-${prefix}-${String(n).padStart(6, '0')}`;
}
