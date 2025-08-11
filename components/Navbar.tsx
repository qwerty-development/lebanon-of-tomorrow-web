"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { LogOut, Users, PlusCircle, BarChart3, Shield } from "lucide-react";

export function Navbar() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      setIsSuper(data?.role === "super_admin");
    })();
  }, []);

  const links = [
    { href: `/${locale}/dashboard/attendees`, label: isArabic ? "الحضور" : "Attendees", icon: Users },
    ...(isSuper ? [{ href: `/${locale}/dashboard/add`, label: isArabic ? "إضافة" : "Add", icon: PlusCircle }] : []),
    { href: `/${locale}/dashboard/stats`, label: isArabic ? "الإحصائيات" : "Stats", icon: BarChart3 },
    ...(isSuper ? [{ href: `/${locale}/dashboard/admin`, label: isArabic ? "المشرف الأعلى" : "Super Admin", icon: Shield }] : []),
  ];

  return (
    <header className="border-b border-[#e5e7eb] bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-[var(--muted)]">Lebanon of Tomorrow</div>
        <nav className="flex items-center gap-2">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="pill inline-flex items-center gap-2 hover:bg-gray-100">
              <Icon size={16} />
              <span className="text-sm">{label}</span>
            </Link>
          ))}
          <button
            className="pill inline-flex items-center gap-2 hover:bg-gray-100 ml-2"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = `/${locale}/login`;
            }}
          >
            <LogOut size={16} />
            <span className="text-sm">{isArabic ? "خروج" : "Sign out"}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

