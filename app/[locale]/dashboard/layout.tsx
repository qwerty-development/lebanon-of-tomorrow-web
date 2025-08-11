"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { Navbar } from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const t = {
    title: isArabic ? "لوحة التحكم" : "Dashboard",
    attendees: isArabic ? "الحضور" : "Attendees",
    add: isArabic ? "إضافة" : "Add",
    stats: isArabic ? "الإحصائيات" : "Stats",
    admin: isArabic ? "المشرف الأعلى" : "Super Admin",
    lang: isArabic ? "English" : "العربية",
    signOut: isArabic ? "تسجيل الخروج" : "Sign out",
  };

  return (
    <RequireAuth>
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 container mx-auto py-6 lg:py-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}

