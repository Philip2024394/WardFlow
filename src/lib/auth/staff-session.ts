// Staff (nurse/doctor) cookie-session helpers. Mirrors src/lib/family/session.ts.
import { createHmac } from 'node:crypto';
import { cookies } from 'next/headers';

const NURSE_COOKIE = 'wf_nurse';
const DOCTOR_COOKIE = 'wf_doctor';
const DEFAULT_TTL_MIN = 12 * 60; // 12h shift

export type StaffRole = 'nurse' | 'doctor';

export interface StaffPayload {
  user_id: string;
  wf_id: string;
  role: StaffRole;
  exp: number;
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

export function buildStaffCookie(
  payload: Omit<StaffPayload, 'exp'>,
  ttlMin = DEFAULT_TTL_MIN,
) {
  const full: StaffPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlMin * 60,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = sign(body);
  return {
    name: payload.role === 'nurse' ? NURSE_COOKIE : DOCTOR_COOKIE,
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

export function verifyStaffCookie(raw: string | undefined): StaffPayload | null {
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as StaffPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function getStaffSession(): Promise<StaffPayload | null> {
  const store = await cookies();
  const nurse = verifyStaffCookie(store.get(NURSE_COOKIE)?.value);
  if (nurse) return nurse;
  const doctor = verifyStaffCookie(store.get(DOCTOR_COOKIE)?.value);
  if (doctor) return doctor;
  return null;
}

export const NURSE_COOKIE_NAME = NURSE_COOKIE;
export const DOCTOR_COOKIE_NAME = DOCTOR_COOKIE;
