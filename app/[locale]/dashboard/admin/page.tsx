"use client";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
// events removed; using global fields
import { useEffect, useState } from "react";

async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  } catch (err) {
    console.warn("CSV download failed:", err);
  }
}

export default function AdminPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const t = {
    title: isArabic ? "المشرف الأعلى" : "Super Admin",
    reset: isArabic ? "إعادة تعيين السجلات" : "Reset records",
    selectiveReset: isArabic ? "إعادة تعيين حسب اختيارك" : "Selective reset",
    export: isArabic ? "تصدير CSV" : "Export CSV",
    stations: isArabic ? "المحطات" : "Stations",
    main: isArabic ? "المدخل" : "Main",
    medical: isArabic ? "طبي" : "Medical",
    dental: isArabic ? "أسنان" : "Dental",
    stationary: isArabic ? "قرطاسية" : "Stationary",
    confirmReset: isArabic
      ? "هل أنت متأكد أنك تريد إعادة تعيين السجلات؟ سيتم حفظ نسخة CSV تلقائيًا."
      : "Are you sure you want to reset records? A CSV backup will be downloaded automatically.",
    confirmSelective: isArabic
      ? "هل أنت متأكد من إعادة التعيين المحدد؟ سيتم حفظ نسخة CSV تلقائيًا."
      : "Are you sure you want to selectively reset? A CSV backup will be downloaded automatically.",
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center lg:text-left">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
          {t.title}
        </h1>
        <p className="text-[var(--muted)] text-responsive">
          {isArabic ? "إدارة النظام والمحطات والبيانات" : "System, stations, and data management"}
        </p>
      </div>

      {/* Fields Management Section */}
      <FieldsManager />
      
      {/* Data Management Section */}
      <div className="glass rounded-2xl p-6 lg:p-8">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {isArabic ? "إدارة البيانات" : "Data Management"}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reset All Button */}
          <div className="space-y-4">
            <div className="p-4 border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20 rounded-xl">
              <h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
                {isArabic ? "إعادة تعيين شاملة" : "Complete Reset"}
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                {isArabic ? "سيتم حذف جميع بيانات الحضور مع إنشاء نسخة احتياطية تلقائياً" : "This will delete all attendance data with automatic backup"}
              </p>
              <button
                className="btn bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                onClick={async () => {
              const confirmed = window.confirm(t.confirmReset);
              if (!confirmed) return;
              // Export CSV first
              const { data } = await supabase
                .from("attendees")
                .select("*")
                ;
              const rows = data ?? [];
              const csv = [
                [
                  "id",
                  "name",
                  "record_number",
                  "governorate",
                  "district",
                  "area",
                  "phone",
                  "quantity",
                  "created_at",
                ].join(","),
                ...rows.map((r: any) =>
                  [
                    r.id,
                    JSON.stringify(r.name),
                    r.record_number,
                    JSON.stringify(r.governorate),
                    JSON.stringify(r.district),
                    JSON.stringify(r.area),
                    r.phone ?? "",
                    r.quantity,
                    r.created_at,
                  ].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              await downloadBlob(blob, `attendees-backup-before-reset.csv`);

              // Then reset
                  const { error } = await supabase.rpc("reset_attendance");
                  if (error) alert(error.message);
                }}
              >
                {t.reset}
              </button>
            </div>
          </div>

          {/* Selective Reset */}
          <div className="space-y-4">
            <div className="p-4 border border-orange-200 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-900/20 rounded-xl">
              <h3 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
                {isArabic ? "إعادة تعيين محددة" : "Selective Reset"}
              </h3>
              <p className="text-sm text-orange-600 dark:text-orange-400 mb-4">
                {isArabic ? "اختر المحطات المراد إعادة تعيينها" : "Choose specific stations to reset"}
              </p>
              <SelectiveReset locale={locale} labels={t} />
            </div>
          </div>
        </div>

        {/* Export Section */}
        <div className="mt-6 pt-6 border-t border-[var(--border-glass)]">
          <div className="p-4 border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20 rounded-xl">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              {isArabic ? "تصدير البيانات" : "Export Data"}
            </h3>
            <p className="text-sm text-blue-600 dark:text-blue-400 mb-4">
              {isArabic ? "تحميل جميع بيانات المشاركين كملف CSV" : "Download all attendee data as CSV file"}
            </p>
            <button
              className="btn bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700"
              onClick={async () => {
                const { data, error } = await supabase
                  .from("attendees")
                  .select("*");
                if (error) {
                  alert(error.message);
                  return;
                }
                const rows = data ?? [];
                const csv = [
                  [
                    "id",
                    "name",
                    "record_number",
                    "governorate",
                    "district",
                    "area",
                    "phone",
                    "quantity",
                    "created_at",
                  ].join(","),
                  ...rows.map((r: any) =>
                    [
                      r.id,
                      JSON.stringify(r.name),
                      r.record_number,
                      JSON.stringify(r.governorate),
                      JSON.stringify(r.district),
                      JSON.stringify(r.area),
                      r.phone ?? "",
                      r.quantity,
                      r.created_at,
                    ].join(",")
                  ),
                ].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                await downloadBlob(blob, `attendees.csv`);
              }}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t.export}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type StationFlags = {
  enable_main_entrance: boolean;
  enable_medical_check: boolean;
  enable_dental_check: boolean;
  enable_stationary_backpack: boolean;
};

function FieldsManager() {
  const [fields, setFields] = useState<any[]>([]);
  const [newName, setNewName] = useState("");

  async function load() {
    const { data } = await supabase
      .from("fields")
      .select("id,name,is_enabled,is_main,sort_order")
      .order("sort_order", { ascending: true });
    setFields(data ?? []);
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel("fields-realtime-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fields" },
        () => load()
      )
      .on("broadcast", { event: "fields_changed" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="glass rounded-2xl p-6 lg:p-8">
      <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
        {/* Assuming locale context from parent */}
        Fields Management
      </h2>
      
      {/* Add New Field Form */}
      <form
        className="flex flex-col sm:flex-row gap-3 mb-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const { error } = await supabase.from("fields").insert({ 
            name, 
            is_enabled: true, 
            sort_order: (fields[fields.length-1]?.sort_order ?? 0) + 1, 
            is_main: false 
          });
          if (!error) {
            setNewName("");
            await load();
            await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
            await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
          } else alert(error.message);
        }}
      >
        <input 
          className="flex-1 glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all" 
          placeholder="New field name" 
          value={newName} 
          onChange={(e) => setNewName(e.target.value)} 
        />
        <button className="btn btn-primary px-6">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Field
        </button>
      </form>
      
      {/* Fields List */}
      <div className="space-y-3">
        {fields.map((f, idx) => (
          <div key={f.id} className="glass-strong rounded-xl p-4 border border-[var(--border-glass)]">
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Field Name Input */}
              <div className="flex-1">
                <input
                  className="w-full glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all font-medium"
                  value={f.name}
                  onChange={async (e) => {
                    const name = e.target.value;
                    setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, name } : x)));
                    await supabase.from("fields").update({ name }).eq("id", f.id);
                    await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
                  }}
                />
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Enabled Toggle */}
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.is_enabled}
                    onChange={async (e) => {
                      const is_enabled = e.target.checked;
                      setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_enabled } : x)));
                      await supabase.from("fields").update({ is_enabled }).eq("id", f.id);
                      await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                      await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    }}
                    className="w-4 h-4 rounded border-[var(--border-glass)] text-[var(--brand)] focus:ring-[var(--brand)] focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-[var(--foreground)]">Enabled</span>
                </label>

                {/* Main Radio */}
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="main_field"
                    checked={f.is_main}
                    onChange={async () => {
                      // set this field as main, unset others
                      await supabase.rpc("reset_attendance_selective", { p_field_ids: [f.id] });
                      await supabase.from("fields").update({ is_main: false }).neq("id", f.id);
                      const { error } = await supabase.from("fields").update({ is_main: true }).eq("id", f.id);
                      if (error) alert(error.message);
                      await load();
                      await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                      await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    }}
                    className="w-4 h-4 border-[var(--border-glass)] text-[var(--brand)] focus:ring-[var(--brand)] focus:ring-offset-0"
                  />
                  <span className="text-sm font-medium text-[var(--foreground)]">Main</span>
                </label>

                {/* Sort Controls */}
                <div className="flex items-center gap-1">
                  <button
                    className="btn glass w-8 h-8 p-0 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={async () => {
                      const up = fields[idx-1];
                      if (!up) return;
                      await supabase.from("fields").update({ sort_order: up.sort_order }).eq("id", f.id);
                      await supabase.from("fields").update({ sort_order: f.sort_order }).eq("id", up.id);
                      await load();
                      await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                      await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    className="btn glass w-8 h-8 p-0 flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30"
                    disabled={idx === fields.length - 1}
                    onClick={async () => {
                      const down = fields[idx+1];
                      if (!down) return;
                      await supabase.from("fields").update({ sort_order: down.sort_order }).eq("id", f.id);
                      await supabase.from("fields").update({ sort_order: f.sort_order }).eq("id", down.id);
                      await load();
                      await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Delete Button */}
                <button
                  className="btn bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 px-3 py-1 text-sm"
                  onClick={async () => {
                    if (!window.confirm("Delete field?")) return;
                    const { error } = await supabase.from("fields").delete().eq("id", f.id);
                    if (error) alert(error.message);
                    await load();
                    await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                    await supabase.channel("app").send({ type: "broadcast", event: "fields_changed", payload: {} });
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectiveReset({
  locale,
  labels,
}: {
  locale: "en" | "ar";
  labels: any;
}) {
  const [fields, setFields] = useState<Array<{ id: string; name: string; is_enabled: boolean }>>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fields")
        .select("id,name,is_enabled")
        .eq("is_enabled", true)
        .order("name", { ascending: true });
      const rows = data ?? [];
      setFields(rows as any);
      const initial: Record<string, boolean> = {};
      for (const f of rows as any[]) initial[f.id] = false;
      setSelected(initial);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {fields.map((f) => (
          <label key={f.id} className="inline-flex items-center gap-2 cursor-pointer pill text-sm">
            <input
              type="checkbox"
              checked={!!selected[f.id]}
              onChange={(e) => setSelected((prev) => ({ ...prev, [f.id]: e.target.checked }))}
              className="w-4 h-4 rounded border-[var(--border-glass)] text-orange-600 focus:ring-orange-500 focus:ring-offset-0"
            />
            <span className="font-medium">{f.name}</span>
          </label>
        ))}
      </div>
      <button
        className="btn bg-orange-600 hover:bg-orange-700 text-white border-orange-600 hover:border-orange-700 disabled:opacity-50"
        disabled={Object.values(selected).every(v => !v)}
        onClick={async () => {
          const confirmed = window.confirm(labels.confirmSelective);
          if (!confirmed) return;
          // Export CSV first
          const { data, error } = await supabase
            .from("attendees")
            .select("*");
          if (error) {
            alert(error.message);
            return;
          }
          const rows = data ?? [];
          const header = [
            "id","name","record_number","governorate","district","area","phone","quantity","created_at"
          ];
          const csv = [
            header.join(","),
            ...rows.map((r: any) => [
              r.id, JSON.stringify(r.name), r.record_number, JSON.stringify(r.governorate), JSON.stringify(r.district), JSON.stringify(r.area),
              r.phone ?? "", r.quantity, r.created_at
            ].join(","))
          ].join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          await downloadBlob(blob, `attendees-backup-before-selective-reset.csv`);

          // Then reset selectively
          const ids = Object.entries(selected)
            .filter(([, v]) => v)
            .map(([id]) => id);
          if (ids.length === 0) return;
          const { error: rpcError } = await supabase.rpc("reset_attendance_selective", { p_field_ids: ids });
          if (rpcError) alert(rpcError.message);
        }}
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Reset Selected
      </button>
    </div>
  );
}

