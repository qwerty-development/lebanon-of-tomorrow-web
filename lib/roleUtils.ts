// Station roles for 2026. One role per station, plus the two full-access roles
// (`admin`, `super_admin`) and `none` for an account with no station yet.
//
// This mirrors public.can_user_modify_field() in the database — the database is
// the one that actually enforces access (trigger on attendee_field_status), and
// this copy exists so the UI can grey out the stations an operator cannot use.
// Change one, change the other.

export type UserRole =
  | 'admin'
  | 'super_admin'
  | 'main_entrance'
  | 'stationary_backpacks'
  | 'dental_usj'
  | 'medical_lau'
  | 'optic_et_vision'
  | 'lg_sealco'
  | 'bey_1'
  | 'none';

/** Roles that reach every station. */
export const FULL_ACCESS_ROLES: UserRole[] = ['admin', 'super_admin'];

/** One role per station, in station order. */
export const STATION_ROLES: UserRole[] = [
  'main_entrance',
  'stationary_backpacks',
  'dental_usj',
  'medical_lau',
  'optic_et_vision',
  'lg_sealco',
  'bey_1',
];

/**
 * Keywords matched (case-insensitively, as substrings) against the station name.
 * Substrings rather than exact names so a station can be renamed
 * "Dental Check (USJ) - tent 2" without locking its operators out. Renaming a
 * station so that none of its keywords survive DOES lock them out — keep a
 * keyword in the name, or add the new one here and in the SQL function.
 */
export const ROLE_FIELD_PATTERNS: Record<UserRole, string[]> = {
  admin: [],           // handled by FULL_ACCESS_ROLES
  super_admin: [],     // handled by FULL_ACCESS_ROLES
  main_entrance: ['main entrance', 'main gate', 'مدخل'],
  stationary_backpacks: ['stationary', 'stationery', 'backpack', 'قرطاسية', 'حقائب', 'حقيبة'],
  dental_usj: ['dental', 'usj', 'أسنان'],
  medical_lau: ['medical', 'lau', 'طبي'],
  optic_et_vision: ['optic', 'vision', 'بصر', 'نظر', 'عيون'],
  lg_sealco: ['sealco'],
  bey_1: ['bey 1', 'bey1', 'بيروت 1'],
  none: [],
};

export function isFullAccessRole(userRole: UserRole): boolean {
  return FULL_ACCESS_ROLES.includes(userRole);
}

/**
 * @param isMainField the station's `is_main` flag. The main_entrance role owns
 *   whichever station is flagged main, whatever it happens to be named.
 */
export function canUserModifyField(
  userRole: UserRole,
  fieldName: string,
  isMainField = false
): boolean {
  if (isFullAccessRole(userRole)) {
    return true;
  }

  if (userRole === 'main_entrance' && isMainField) {
    return true;
  }

  const patterns = ROLE_FIELD_PATTERNS[userRole] ?? [];
  const haystack = (fieldName ?? '').toLowerCase();
  return patterns.some((pattern) => haystack.includes(pattern));
}

const ROLE_NAMES: Record<UserRole, { en: string; ar: string }> = {
  admin: { en: 'Admin', ar: 'مشرف' },
  super_admin: { en: 'Super Admin', ar: 'المشرف الأعلى' },
  main_entrance: { en: 'Main Entrance', ar: 'المدخل الرئيسي' },
  stationary_backpacks: { en: 'Stationary & Backpacks', ar: 'القرطاسية والحقائب' },
  dental_usj: { en: 'Dental (USJ)', ar: 'الأسنان (USJ)' },
  medical_lau: { en: 'Medical (LAU)', ar: 'الفحص الطبي (LAU)' },
  optic_et_vision: { en: 'Optic et Vision', ar: 'البصريات والنظر' },
  lg_sealco: { en: 'LG Sealco', ar: 'LG Sealco' },
  bey_1: { en: 'Bey 1', ar: 'بيروت 1' },
  none: { en: 'No station assigned', ar: 'لا محطة مخصصة' },
};

export function getRoleDisplayName(role: UserRole, isArabic: boolean): string {
  const entry = ROLE_NAMES[role];
  if (!entry) return role;
  return isArabic ? entry.ar : entry.en;
}
