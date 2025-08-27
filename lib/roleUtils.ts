export type UserRole = 'admin' | 'super_admin' | 'shabebik' | 'optic_et_vision' | 'medical' | 'dental';

export function canUserModifyField(userRole: UserRole, fieldName: string): boolean {
  if (userRole === 'admin' || userRole === 'super_admin') {
    return true;
  }
  
  const fieldLower = fieldName.toLowerCase();
  
  switch (userRole) {
    case 'shabebik':
      return fieldLower.includes('shabebik') || fieldLower.includes('شبابيك');
    case 'optic_et_vision':
      return fieldLower.includes('optic') || fieldLower.includes('vision') || 
             fieldLower.includes('بصر') || fieldLower.includes('عيون');
    case 'medical':
      return fieldLower.includes('medical') || fieldLower.includes('طبي');
    case 'dental':
      return fieldLower.includes('dental') || fieldLower.includes('أسنان');
    default:
      return false;
  }
}

export function getRoleDisplayName(role: UserRole, isArabic: boolean): string {
  const names = {
    admin: isArabic ? 'مشرف' : 'Admin',
    super_admin: isArabic ? 'المشرف الأعلى' : 'Super Admin',
    shabebik: isArabic ? 'شبابيك' : 'Registration',
    optic_et_vision: isArabic ? 'بصريات ورؤية' : 'Optics & Vision',
    medical: isArabic ? 'طبي' : 'Medical',
    dental: isArabic ? 'أسنان' : 'Dental'
  };
  
  return names[role] || role;
}
