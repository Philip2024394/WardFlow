// User roles for WardFlow. Matches the Postgres enum `user_role` in 0002_roles_and_policies.sql.
export type UserRole =
  | 'nurse'
  | 'doctor'
  | 'supervisor'
  | 'admin'
  | 'reception'
  | 'family';

export const ALL_ROLES: UserRole[] = [
  'nurse',
  'doctor',
  'supervisor',
  'admin',
  'reception',
  'family',
];

export const ROLE_HOME: Record<UserRole, string> = {
  nurse: '/nurse',
  doctor: '/doctor',
  supervisor: '/supervisor',
  admin: '/admin',
  reception: '/admin', // reception lands on admin shell for Phase 0
  family: '/family',
};
