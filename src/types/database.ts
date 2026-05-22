// Hand-rolled types for Phase 0. Replace with `supabase gen types typescript` output
// once Phil links a real project: `npx supabase gen types typescript --linked > src/types/database.ts`
import type { UserRole } from './roles';

export type Locale = 'id' | 'en';
export type RiskLevel = 'green' | 'yellow' | 'orange' | 'red';
export type EmergencyKind =
  | 'cardiac'
  | 'respiratory'
  | 'fall'
  | 'aggressive'
  | 'medication_reaction'
  | 'unknown';
export type MedicationStatus = 'given' | 'missed' | 'refused';

export interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  language: Locale;
  is_active: boolean;
  last_login_at: string | null;
  photo_url: string | null;
  phone_e164: string | null;
}

export interface Ward {
  id: string;
  name: string;
  code: string;
  floor: string | null;
  capacity: number;
}

export interface Patient {
  id: string;
  full_name: string;
  photo_url: string | null;
  dob: string;
  gender: 'M' | 'F' | 'X';
  ward_id: string;
  bed_no: string;
  diagnosis: string | null;
  allergies: string[] | null;
  blood_type: string | null;
  risk_level: RiskLevel;
  assigned_doctor_id: string | null;
  assigned_nurse_id: string | null;
  admitted_at: string;
  emergency_contact: Record<string, unknown> | null;
  insurance: Record<string, unknown> | null;
  family_contacts: Record<string, unknown> | null;
  current_medications: Record<string, unknown> | null;
}

export interface Vitals {
  id: string;
  patient_id: string;
  recorded_by: string;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  temperature_c: number | null;
  oxygen_pct: number | null;
  heart_rate_bpm: number | null;
  pain_score: number | null;
  respiratory_rate: number | null;
  recorded_at: string;
}

export interface PatientRound {
  id: string;
  patient_id: string;
  nurse_id: string;
  round_at: string;
  vitals_id: string | null;
  notes: string | null;
  photo_urls: string[] | null;
  missed_fields: Record<string, unknown> | null;
}

export interface FamilyAccessCode {
  id: string;
  code: string;
  patient_id: string;
  granted_by_doctor_id: string;
  allowed_sections: FamilySection[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export type FamilySection =
  | 'care_rounds'
  | 'medications'
  | 'doctor_notes'
  | 'emergency_info';

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  device_id: string | null;
  occurred_at: string;
}
