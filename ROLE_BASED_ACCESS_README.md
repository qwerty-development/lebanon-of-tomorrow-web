# Role-Based Field Access System

## Overview

This system implements role-based field access control for the Lebanon of Tomorrow attendance management application. Users are assigned specific roles that determine which fields they can check/uncheck for attendees.

## User Roles

### Full Access Roles
- **`admin`** - Can access and modify all fields
- **`super_admin`** - Can access and modify all fields, plus override restrictions

### Restricted Access Roles
- **`shabebik`** - Can only modify fields containing "shabebik" or "شبابيك"
- **`optic_et_vision`** - Can only modify fields containing "optic", "vision", "بصر", or "عيون"
- **`medical`** - Can only modify fields containing "medical" or "طبي"
- **`dental`** - Can only modify fields containing "dental" or "أسنان"

## Implementation Details

### Database Changes

1. **Updated `user_role` enum** - Added new role values
2. **New function `can_user_modify_field()`** - Checks if a user can modify a specific field
3. **Updated trigger function** - Enforces role-based access at the database level
4. **Sample fields** - Added test fields for each role type
5. **Admin functions** - `list_all_users()` and `update_user_role()` for super admin management

### Frontend Changes

1. **Role utilities** (`lib/roleUtils.ts`) - Helper functions for role checking and display
2. **Updated attendees page** - Integrates role-based field access
3. **Enhanced Station component** - Shows role restrictions visually
4. **Updated Navbar** - Displays current user's role

### Visual Indicators

- **Green fields** - Fields the user can modify
- **Red borders** - Role-restricted fields (cannot modify)
- **Orange borders** - Disabled fields (can be overridden by super admin)
- **Role badges** - Shows current user's role in navbar

## Usage

### Assigning Roles

Roles are assigned through the admin panel or using the admin functions. Only super admins can change user roles.

#### Using Admin Functions (Recommended)

```sql
-- List all users (super admin only)
SELECT * FROM public.list_all_users();

-- Update user role (super admin only)
SELECT public.update_user_role('user-uuid-here', 'shabebik');
```

#### Direct Database Update (Alternative)

```sql
UPDATE public.profiles 
SET role = 'shabebik' 
WHERE id = 'user-uuid-here';
```

### Field Naming Convention

Fields should be named to match the role they're intended for:

- **Shabebik fields**: Include "shabebik" or "شبابيك"
- **Optics fields**: Include "optic", "vision", "بصر", or "عيون"
- **Medical fields**: Include "medical" or "طبي"
- **Dental fields**: Include "dental" or "أسنان"

### Testing Role Access

Use the `role_field_permissions` view to see what each role can access:

```sql
SELECT * FROM public.role_field_permissions 
WHERE role = 'shabebik';
```

## Security Features

1. **Database-level enforcement** - Role checks happen in database triggers
2. **Frontend validation** - UI prevents unauthorized actions
3. **Audit trail** - All field modifications are logged with user context
4. **Super admin override** - Super admins can bypass role restrictions

## Migration

To apply the role-based access system:

1. Run the migration file: `supabase/migration_role_based_access.sql`
2. Update existing user roles as needed
3. Ensure field names follow the naming convention
4. Test with different user roles

## Troubleshooting

### Common Issues

1. **"You do not have permission to modify this field"** - User's role doesn't match field name
2. **Fields not showing as restricted** - Check field naming convention
3. **Role not updating** - Verify database migration ran successfully
4. **Can only see own user in admin panel** - RLS policies are working correctly; use admin functions instead

### Debug Queries

```sql
-- Check user's current role
SELECT role FROM public.profiles WHERE id = auth.uid();

-- Check field permissions for a role
SELECT field_name, can_modify 
FROM public.role_field_permissions 
WHERE role = 'shabebik';

-- Test role function directly
SELECT public.can_user_modify_field('shabebik', 'Medical Check');
```

## Future Enhancements

1. **Role hierarchy** - Allow roles to inherit permissions
2. **Custom field permissions** - Database table for role-field mappings
3. **Temporary permissions** - Time-limited role assignments
4. **Audit logging** - Track all permission checks and violations
