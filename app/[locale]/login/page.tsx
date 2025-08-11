"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const t = {
    title: isArabic ? "تسجيل الدخول" : "Sign in",
    email: isArabic ? "البريد الإلكتروني" : "Email",
    password: isArabic ? "كلمة المرور" : "Password",
    submit: isArabic ? "دخول" : "Sign in",
    switchTo: isArabic ? "English" : "العربية",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 lg:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Branding */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-600)] shadow-lg" />
              <div className="absolute inset-0 w-4 h-4 rounded-full bg-gradient-to-r from-[var(--brand)] to-[var(--brand-600)] animate-ping opacity-20" />
            </div>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)]">
            Lebanon of Tomorrow
          </h1>
          <p className="text-[var(--muted)] text-sm">
            {isArabic ? "نظام إدارة الحضور والتوزيع" : "Attendance & Distribution Management"}
          </p>
        </div>

        {/* Login Card */}
        <div className="card p-6 lg:p-8 space-y-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-[var(--foreground)]">{t.title}</h2>
          </div>
          
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setLoading(true);
              const { error } = await supabase.auth.signInWithPassword({ email, password });
              setLoading(false);
              if (error) {
                setError(isArabic ? "بيانات الدخول غير صحيحة" : "Invalid credentials");
                return;
              }
              window.location.href = `/${locale}/dashboard`;
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  {t.email}
                </label>
                <input
                  type="email"
                  className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                  placeholder={isArabic ? "أدخل بريدك الإلكتروني" : "Enter your email"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  {t.password}
                </label>
                <input
                  type="password"
                  className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                  placeholder={isArabic ? "أدخل كلمة المرور" : "Enter your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary h-12 text-base font-semibold disabled:opacity-50 relative overflow-hidden"
            >
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-inherit">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <span className={loading ? "opacity-0" : ""}>
                {loading ? (isArabic ? "...جارٍ الدخول" : "Signing in...") : t.submit}
              </span>
            </button>
          </form>

          {error && (
            <div className="glass-strong rounded-xl p-4 border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20">
              <div className="text-red-600 dark:text-red-400 text-sm text-center font-medium">{error}</div>
            </div>
          )}
        </div>

        {/* Language Toggle */}
        <div className="text-center">
          <Link
            href={`/${isArabic ? "en" : "ar"}/login`}
            className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <span className="w-1 h-1 rounded-full bg-[var(--muted)]" />
            {t.switchTo}
          </Link>
        </div>
      </div>
    </div>
  );
}

