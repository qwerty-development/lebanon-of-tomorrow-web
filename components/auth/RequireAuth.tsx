"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const session = data.session;
      if (!session) router.replace(`/${locale}/login`);
      else setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) router.replace(`/${locale}/login`);
    });
    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, locale]);

  if (checking) return null;
  return <>{children}</>;
}

