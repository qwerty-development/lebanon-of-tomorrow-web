"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AddAttendeePage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      setIsSuperAdmin(data?.role === "super_admin");
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

  if (!isSuperAdmin) return <div className="text-sm text-[var(--muted)]">{isArabic ? "غير مصرح" : "Not authorized"}</div>;

  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <form
        className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setStatus(null);
          setLoading(true);
          const { error } = await supabase.from("attendees").insert({
            name: form.name.trim(),
            record_number: form.recordNumber.trim(),
            governorate: form.governorate.trim(),
            district: form.district.trim(),
            area: form.area.trim(),
            phone: form.phone.trim() || null,
            quantity: form.quantity,
          });
          setLoading(false);
          if (error) {
            setStatus(isArabic ? "فشل الحفظ" : "Save failed");
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
        }}
      >
        <label className="block">
          <span className="block text-sm mb-1">{t.name}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.record}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.recordNumber}
            onChange={(e) => setForm({ ...form, recordNumber: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.governorate}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.governorate}
            onChange={(e) => setForm({ ...form, governorate: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.district}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.area}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.area}
            onChange={(e) => setForm({ ...form, area: e.target.value })}
            required
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.phone}</span>
          <input
            className="w-full border rounded px-3 py-2"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">{t.qty}</span>
          <input
            type="number"
            min={1}
            className="w-full border rounded px-3 py-2"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
            required
          />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button disabled={loading} className="btn btn-primary disabled:opacity-50">
            {loading ? (isArabic ? "...جارٍ الحفظ" : "Saving...") : t.submit}
          </button>
          {status && <span className="text-sm text-black/60">{status}</span>}
        </div>
      </form>
    </div>
  );
}

