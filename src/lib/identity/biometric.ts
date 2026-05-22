// Biometric verification — STUB.
// Real implementation will use WebAuthn (navigator.credentials.get) for the nurse's
// fingerprint at the bedside tablet, and a separate ceremony for the patient.
// Until that ships, every server-side check returns ok=false with reason='not_implemented'
// so the API layer falls back to PIN/tap/photo. Audit trail still records the attempt.

export type BiometricIntent =
  | 'nurse_accept_handover'
  | 'nurse_visit_confirm'
  | 'doctor_self_assign'
  | 'patient_visit_witness';

export interface BiometricResult {
  ok: boolean;
  reason: 'verified' | 'not_implemented' | 'not_enrolled' | 'mismatch';
  ceremony_id?: string;
}

// TODO(WebAuthn): wire navigator.credentials.create / .get + relying-party challenge
// storage in a new `webauthn_credentials` table. Out of scope for Phase 1.
export async function verifyFingerprint(_args: {
  userId: string;
  intent: BiometricIntent;
  signaturePayload?: unknown;
}): Promise<BiometricResult> {
  return { ok: false, reason: 'not_implemented' };
}

// PIN verification is the documented fallback. Real implementation will bcrypt-compare
// against nurses.pin_hash; here we provide the contract so the API layer is type-safe.
export async function verifyPin(_args: {
  userId: string;
  pin: string;
}): Promise<BiometricResult> {
  // TODO: bcrypt compare against nurses.pin_hash via service client.
  return { ok: false, reason: 'not_implemented' };
}
