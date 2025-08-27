-- Migration: Add role-based field access system
-- This migration adds new user roles and implements role-based field access control

-- 1. Update user_role enum with new roles
DO $$
BEGIN
  -- Add new roles if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role') AND enumlabel = 'shabebik') THEN
    ALTER TYPE public.user_role ADD VALUE 'shabebik';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role') AND enumlabel = 'optic_et_vision') THEN
    ALTER TYPE public.user_role ADD VALUE 'optic_et_vision';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role') AND enumlabel = 'medical') THEN
    ALTER TYPE public.user_role ADD VALUE 'medical';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role') AND enumlabel = 'dental') THEN
    ALTER TYPE public.user_role ADD VALUE 'dental';
  END IF;
END $$;

-- 2. Create function to check if user can modify a specific field
CREATE OR REPLACE FUNCTION public.can_user_modify_field(user_role public.user_role, field_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Super admin and admin can modify all fields
  IF user_role IN ('super_admin', 'admin') THEN
    RETURN true;
  END IF;
  
  -- Role-specific field access (case insensitive matching)
  CASE user_role
    WHEN 'shabebik' THEN
      RETURN lower(field_name) LIKE '%shabebik%' OR lower(field_name) LIKE '%شبابيك%';
    WHEN 'optic_et_vision' THEN  
      RETURN lower(field_name) LIKE '%optic%' OR lower(field_name) LIKE '%vision%' OR lower(field_name) LIKE '%بصر%' OR lower(field_name) LIKE '%عيون%';
    WHEN 'medical' THEN
      RETURN lower(field_name) LIKE '%medical%' OR lower(field_name) LIKE '%طبي%';
    WHEN 'dental' THEN
      RETURN lower(field_name) LIKE '%dental%' OR lower(field_name) LIKE '%أسنان%';
    ELSE
      RETURN false;
  END CASE;
END;
$$;

-- 3. Update the status trigger function to enforce role-based access
CREATE OR REPLACE FUNCTION public.status_enforce_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
DECLARE
  is_main_field boolean;
  has_main boolean;
  attendee_qty integer;
  user_role public.user_role;
  field_name text;
BEGIN
  -- Get user role and field name
  SELECT p.role INTO user_role 
  FROM public.profiles p 
  WHERE p.id = auth.uid();
  
  SELECT f.name INTO field_name 
  FROM public.fields f 
  WHERE f.id = new.field_id;
  
  -- Check if user can modify this field
  IF NOT public.can_user_modify_field(user_role, field_name) THEN
    RAISE exception 'You do not have permission to modify this field';
  END IF;
  
  -- Prevent uncheck by non-super-admins (keep existing logic)
  IF tg_op = 'UPDATE' THEN
    IF old.checked_at IS NOT NULL AND new.checked_at IS NULL AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE exception 'Unchecking is not allowed';
    END IF;
  END IF;
  
  -- Rest of existing logic remains the same...
  IF new.checked_at IS NULL THEN
    IF tg_op = 'UPDATE' AND old.checked_at IS NOT NULL THEN
      RETURN new;
    END IF;
    new.checked_at = now();
  END IF;
  
  IF new.quantity < 1 THEN
    RAISE exception 'Quantity must be at least 1';
  END IF;
  
  SELECT quantity INTO attendee_qty FROM public.attendees WHERE id = new.attendee_id;
  IF new.quantity > attendee_qty THEN
    RAISE exception 'Quantity cannot exceed attendee total quantity';
  END IF;
  
  SELECT is_main INTO is_main_field FROM public.fields WHERE id = new.field_id;
  IF COALESCE(is_main_field, false) = false THEN
    SELECT exists(
      SELECT 1 FROM public.attendee_field_status s
      JOIN public.fields f ON f.id = s.field_id AND f.is_main = true
      WHERE s.attendee_id = new.attendee_id AND s.checked_at IS NOT NULL
    ) INTO has_main;
    IF NOT COALESCE(has_main, false) THEN
      RAISE exception 'Main entrance must be checked first';
    END IF;
  END IF;
  
  RETURN new;
END;
$$;

-- 4. Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION public.can_user_modify_field(public.user_role, text) TO authenticated;

-- 5. Update existing profiles to have admin role if they don't have one
UPDATE public.profiles 
SET role = 'admin' 
WHERE role IS NULL OR role NOT IN ('admin', 'super_admin', 'shabebik', 'optic_et_vision', 'medical', 'dental');

-- 6. Add some sample fields for testing role-based access
INSERT INTO public.fields(name, is_enabled, sort_order, is_main) VALUES
  ('Shabebik Registration', true, 2, false),
  ('شبابيك التسجيل', true, 3, false),
  ('Optics & Vision Check', true, 4, false),
  ('فحص البصر والعيون', true, 5, false),
  ('Medical Check', true, 6, false),
  ('الفحص الطبي', true, 7, false),
  ('Dental Check', true, 8, false),
  ('فحص الأسنان', true, 9, false)
ON CONFLICT (name) DO NOTHING;

-- 7. Create a view for role-based field access (useful for debugging)
CREATE OR REPLACE VIEW public.role_field_permissions AS
SELECT 
  r.role,
  f.name as field_name,
  public.can_user_modify_field(r.role, f.name) as can_modify
FROM (SELECT unnest(enum_range(NULL::public.user_role)) as role) r
CROSS JOIN public.fields f
ORDER BY r.role, f.sort_order;

-- Grant select permission on the view
GRANT SELECT ON public.role_field_permissions TO authenticated;

-- 8. Create admin function to list all users (for super admins only)
CREATE OR REPLACE FUNCTION public.list_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  role public.user_role,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can list all users';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    u.email,
    p.role,
    p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION public.list_all_users() TO authenticated;

-- 9. Create admin function to update user roles (for super admins only)
CREATE OR REPLACE FUNCTION public.update_user_role(p_user_id uuid, p_new_role public.user_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can update user roles';
  END IF;
  
  UPDATE public.profiles 
  SET role = p_new_role, updated_at = now()
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

-- Grant execute permission on the new function
GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, public.user_role) TO authenticated;
