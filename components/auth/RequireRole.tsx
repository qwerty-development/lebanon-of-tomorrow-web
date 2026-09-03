"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { UserRole } from "@/lib/roleUtils";

interface RequireRoleProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallbackMessage?: {
    en: string;
    ar: string;
  };
}

export function RequireRole({ 
  children, 
  allowedRoles, 
  fallbackMessage 
}: RequireRoleProps) {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);

  const isArabic = locale === "ar";

  const defaultMessage = {
    en: "You don't have permission to access this page",
    ar: "ليس لديك صلاحية للوصول إلى هذه الصفحة"
  };

  const message = fallbackMessage || defaultMessage;

  useEffect(() => {
    let isMounted = true;

    const checkAuth = async () => {
      try {
        // First check if user is authenticated
        const { data: sessionData } = await supabase.auth.getSession();
        
        if (!isMounted) return;
        
        const session = sessionData.session;
        if (!session) {
          router.replace(`/${locale}/login`);
          return;
        }

        // Get user role from profiles table
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        
        if (!userId) {
          router.replace(`/${locale}/login`);
          return;
        }

        const { data: profileData, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();

        if (error) {
          console.error("Error fetching user role:", error);
          router.replace(`/${locale}/login`);
          return;
        }

        const role = profileData?.role as UserRole;
        setUserRole(role);

        // Check if user has required role
        if (role && allowedRoles.includes(role)) {
          setHasAccess(true);
        } else {
          setHasAccess(false);
        }
      } catch (error) {
        console.error("Auth check error:", error);
        if (isMounted) {
          router.replace(`/${locale}/login`);
        }
      } finally {
        if (isMounted) {
          setChecking(false);
        }
      }
    };

    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        router.replace(`/${locale}/login`);
      } else if (event === 'SIGNED_IN') {
        // Re-check permissions on sign in
        checkAuth();
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router, locale, allowedRoles]);

  // Show loading state
  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">
            {isArabic ? "جارٍ التحقق من الصلاحيات..." : "Checking permissions..."}
          </p>
        </div>
      </div>
    );
  }

  // Show access denied if user doesn't have required role
  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass rounded-2xl p-8 text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">
            {isArabic ? "غير مصرح" : "Access Denied"}
          </h2>
          <p className="text-[var(--muted)] mb-4">
            {isArabic ? message.ar : message.en}
          </p>
          {userRole && (
            <div className="text-sm text-[var(--muted)] p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p>
                {isArabic ? "دورك الحالي:" : "Your current role:"} {" "}
                <span className="font-medium text-[var(--foreground)]">{userRole}</span>
              </p>
              <p className="mt-1">
                {isArabic ? "الأدوار المطلوبة:" : "Required roles:"} {" "}
                <span className="font-medium text-[var(--foreground)]">
                  {allowedRoles.join(", ")}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // User has access, render children
  return <>{children}</>;
}
