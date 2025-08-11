"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";
import { LogOut, Users, PlusCircle, BarChart3, Shield, Menu, X } from "lucide-react";

export function Navbar() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";
  const [isSuper, setIsSuper] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <>
      {/* Main navbar */}
      <header className="sticky top-0 z-50 glass backdrop-blur-xl border-b border-[var(--border-glass)]">
        <div className="container mx-auto py-3 lg:py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-3 h-3 rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-600)] shadow-lg" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-600)] animate-ping opacity-20" />
              </div>
              <div className="text-sm lg:text-base font-semibold text-[var(--foreground)]">
                <span className="hidden sm:inline">Lebanon of Tomorrow</span>
                <span className="sm:hidden">LoT</span>
              </div>
            </div>

            {/* Desktop navigation */}
            <nav className="hidden lg:flex items-center gap-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Link 
                  key={href} 
                  href={href} 
                  className="pill inline-flex items-center gap-2 hover:scale-105 active:scale-95"
                >
                  <Icon size={16} />
                  <span className="text-sm font-medium">{label}</span>
                </Link>
              ))}
              <div className="w-px h-6 bg-[var(--border-glass)] mx-2" />
              <button
                className="pill inline-flex items-center gap-2 text-red-600 hover:text-red-700 hover:scale-105 active:scale-95"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = `/${locale}/login`;
                }}
              >
                <LogOut size={16} />
                <span className="text-sm font-medium">{isArabic ? "خروج" : "Sign out"}</span>
              </button>
            </nav>

            {/* Mobile menu button */}
            <button
              className="lg:hidden pill w-10 h-10 flex items-center justify-center hover:scale-105 active:scale-95"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Menu panel */}
          <div className={`absolute top-16 ${isArabic ? 'right-4' : 'left-4'} ${isArabic ? 'left-4' : 'right-4'} glass-strong rounded-2xl p-4 shadow-2xl`}>
            <nav className="flex flex-col gap-3">
              {links.map(({ href, label, icon: Icon }) => (
                <Link 
                  key={href} 
                  href={href} 
                  className="pill justify-start gap-3 hover:scale-105 active:scale-95"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Icon size={18} />
                  <span className="font-medium">{label}</span>
                </Link>
              ))}
              <div className="h-px bg-[var(--border-glass)] my-1" />
              <button
                className="pill justify-start gap-3 text-red-600 hover:text-red-700 hover:scale-105 active:scale-95"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = `/${locale}/login`;
                }}
              >
                <LogOut size={18} />
                <span className="font-medium">{isArabic ? "خروج" : "Sign out"}</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

