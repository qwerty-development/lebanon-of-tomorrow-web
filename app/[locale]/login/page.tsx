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
    <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_60%)]">
      <div className="w-full max-w-sm space-y-5 card p-6">
        <h1 className="text-xl font-semibold text-center">{t.title}</h1>
        <form
          className="space-y-3"
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
          <label className="block">
            <span className="block text-sm mb-1">{t.email}</span>
            <input
              type="email"
              className="w-full border rounded px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="block text-sm mb-1">{t.password}</span>
            <input
              type="password"
              className="w-full border rounded px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="w-full btn btn-primary disabled:opacity-50"
          >
            {loading ? (isArabic ? "...جارٍ الدخول" : "Signing in...") : t.submit}
          </button>
        </form>

        {error && (
          <div className="text-red-600 text-sm text-center">{error}</div>
        )}
        <div className="text-center text-sm">
          <Link
            href={`/${isArabic ? "en" : "ar"}/login`}
            className="underline text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {t.switchTo}
          </Link>
        </div>
      </div>
    </div>
  );
}

