"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AddAttendeePage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [checkingRole, setCheckingRole] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id;
        if (!userId) return;
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        setIsSuperAdmin(data?.role === "super_admin");
      } finally {
        setCheckingRole(false);
      }
    })();
  }, []);

  const [form, setForm] = useState({
    name: "",
    recordNumber: "",
    governorate: "",
    district: "",
    area: "",
    phone: "",
    quantity: 1,
  });

  const t = {
    title: isArabic ? "إضافة مشارك" : "Add Attendee",
    name: isArabic ? "الاسم" : "Name",
    record: isArabic ? "رقم السجل" : "Record #",
    governorate: isArabic ? "المحافظة" : "Governorate",
    district: isArabic ? "القضاء" : "District",
    area: isArabic ? "المنطقة" : "Area",
    phone: isArabic ? "رقم الهاتف" : "Phone #",
    qty: isArabic ? "الكمية" : "Quantity",
    submit: isArabic ? "حفظ" : "Save",
  };

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (checkingRole) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-8 h-8 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--muted)]">{isArabic ? "جارٍ التحقق..." : "Checking permissions..."}</p>
        </div>
      </div>
    );
  }
  
  if (!isSuperAdmin) {
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
          <p className="text-[var(--muted)]">
            {isArabic ? "ليس لديك صلاحية للوصول إلى هذه الصفحة" : "You don't have permission to access this page"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center lg:text-left">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
          {t.title}
        </h1>
        <p className="text-[var(--muted)] text-responsive">
          {isArabic ? "إضافة مشارك جديد إلى النظام" : "Add a new participant to the system"}
        </p>
      </div>

      {/* Add Form */}
      <div className="max-w-4xl mx-auto">
        <form
          className="card p-6 lg:p-8 space-y-6"
          onSubmit={async (e) => {
          e.preventDefault();
          setStatus(null);
          setLoading(true);
          try {
            const cleanQuantity = Number.isFinite(Number(form.quantity)) && Number(form.quantity) >= 1 ? Number(form.quantity) : 1;
            const payload = {
              name: form.name.trim(),
              record_number: form.recordNumber.trim(),
              governorate: form.governorate.trim(),
              district: form.district.trim(),
              area: form.area.trim(),
              phone: form.phone.trim() ? form.phone.trim() : null,
              quantity: cleanQuantity,
            };
            const { error } = await supabase.rpc("add_attendee", {
              p_name: payload.name,
              p_record_number: payload.record_number,
              p_governorate: payload.governorate,
              p_district: payload.district,
              p_area: payload.area,
              p_phone: payload.phone,
              p_quantity: payload.quantity,
            });
            if (error) {
              const duplicate = error.message.toLowerCase().includes("unique") || error.message.toLowerCase().includes("duplicate");
              setStatus(
                duplicate
                  ? (isArabic ? "رقم السجل موجود مسبقًا" : "Record number already exists")
                  : (isArabic ? `فشل الحفظ: ${error.message}` : `Save failed: ${error.message}`)
              );
              return;
            }
            setStatus(isArabic ? "تم الحفظ" : "Saved");
            setForm({
              name: "",
              recordNumber: "",
              governorate: "",
              district: "",
              area: "",
              phone: "",
              quantity: 1,
            });
          } finally {
            setLoading(false);
          }
        }}
        >
          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Name Field */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.name} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "أدخل الاسم الكامل" : "Enter full name"}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            {/* Record Number Field */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.record} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "رقم السجل" : "Record number"}
                value={form.recordNumber}
                onChange={(e) => setForm({ ...form, recordNumber: e.target.value })}
                required
              />
            </div>

            {/* Phone Field */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.phone}
              </label>
              <input
                type="tel"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "رقم الهاتف (اختياري)" : "Phone number (optional)"}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>

            {/* Location Fields */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.governorate} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "المحافظة" : "Governorate"}
                value={form.governorate}
                onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.district} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "القضاء" : "District"}
                value={form.district}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.area} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder={isArabic ? "المنطقة" : "Area"}
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                required
              />
            </div>

            {/* Quantity Field */}
            <div>
              <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                {t.qty} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
                placeholder="1"
                value={form.quantity}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setForm({ ...form, quantity: Number.isFinite(value) && value >= 1 ? value : 1 });
                }}
                required
              />
            </div>
          </div>

          {/* Submit Section */}
          <div className="pt-4 border-t border-[var(--border-glass)]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <button 
                type="submit"
                disabled={loading} 
                className="btn btn-primary h-12 px-8 text-base font-semibold disabled:opacity-50 relative overflow-hidden"
              >
                {loading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-inherit">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <span className={loading ? "opacity-0" : ""}>
                  {loading ? (isArabic ? "...جارٍ الحفظ" : "Saving...") : t.submit}
                </span>
              </button>
              
              {status && (
                <div className={`glass-strong rounded-xl px-4 py-2 ${
                  status.includes("تم الحفظ") || status.includes("Saved") 
                    ? "border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20" 
                    : "border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20"
                }`}>
                  <span className={`text-sm font-medium ${
                    status.includes("تم الحفظ") || status.includes("Saved")
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}>
                    {status}
                  </span>
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

