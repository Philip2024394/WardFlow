// Family-portal session helpers. Code-based, signed cookie, short-lived.
import { createHmac, randomBytes } from 'node:crypto';

const COOKIE_NAME = 'wf_family';
const DEFAULT_TTL_MIN = 30;

interface FamilyPayload {
  code: string;
  patient_id: string;
  allowed_sections: string[];
  exp: number; // epoch seconds
}

function secret(): string {
  const s = process.env.FAMILY_SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('FAMILY_SESSION_SECRET is missing or too short (need 16+ chars).');
  }
  return s;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

export function buildFamilyCookie(payload: Omit<FamilyPayload, 'exp'>, ttlMin = DEFAULT_TTL_MIN) {
  const full: FamilyPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlMin * 60,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = sign(body);
  return {
    name: COOKIE_NAME,
    value: `${body}.${sig}`,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: ttlMin * 60,
    },
  };
}

export function verifyFamilyCookie(raw: string | undefined): FamilyPayload | null {
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as FamilyPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function generateAccessCode(): string {
  // Format: WPR-XXXX-XXXX  (uppercase alphanumeric, no confusables)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join('');
  return `WPR-${block()}-${block()}`;
}

export const FAMILY_COOKIE_NAME = COOKIE_NAME;
