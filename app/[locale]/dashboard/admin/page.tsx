"use client";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
// events removed; using global fields
import { useEffect, useState } from "react";

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
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <FieldsManager />
      <div className="flex flex-col gap-3 card p-3">
        <div className="flex items-center gap-3">
          <button
            className="px-4 py-2 rounded border hover:bg-black/5"
            onClick={async () => {
              const confirmed = window.confirm(
                (isArabic
                  ? "هل أنت متأكد أنك تريد إعادة تعيين السجلات؟ سيتم حفظ نسخة CSV تلقائيًا."
                  : "Are you sure you want to reset records? A CSV backup will be downloaded automatically.")
              );
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
                  "main_entrance_at",
                  "medical_check_at",
                  "dental_check_at",
                  "stationary_backpack_at",
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
                    r.main_entrance_at ?? "",
                    r.medical_check_at ?? "",
                    r.dental_check_at ?? "",
                    r.stationary_backpack_at ?? "",
                    r.created_at,
                  ].join(",")
                ),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `attendees-backup-before-reset.csv`;
              a.click();
              URL.revokeObjectURL(url);

              // Then reset
              await supabase.rpc("reset_attendance");
            }}
          >
            {t.reset}
          </button>
          <SelectiveReset locale={locale} labels={t} />
        </div>
        <button
          className="px-4 py-2 rounded border hover:bg-black/5"
          onClick={async () => {
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
                "main_entrance_at",
                "medical_check_at",
                "dental_check_at",
                "stationary_backpack_at",
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
                  r.main_entrance_at ?? "",
                  r.medical_check_at ?? "",
                  r.dental_check_at ?? "",
                  r.stationary_backpack_at ?? "",
                  r.created_at,
                ].join(",")
              ),
            ].join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `attendees.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          {t.export}
        </button>
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
    <div className="card p-3 text-sm space-y-3">
      <div className="font-medium">Fields</div>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          const { error } = await supabase.from("fields").insert({ name, is_enabled: true, sort_order: (fields[fields.length-1]?.sort_order ?? 0) + 1, is_main: false });
          if (!error) {
            setNewName("");
            await load();
            await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
          } else alert(error.message);
        }}
      >
        <input className="border rounded px-2 py-1 flex-1" placeholder="New field name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="px-3 py-1 rounded border">Add</button>
      </form>
      <div className="grid gap-2">
        {fields.map((f, idx) => (
          <div key={f.id} className="flex items-center gap-2">
            <input
              className="border rounded px-2 py-1 flex-1"
              value={f.name}
              onChange={async (e) => {
                const name = e.target.value;
                setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, name } : x)));
                await supabase.from("fields").update({ name }).eq("id", f.id);
                await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
              }}
            />
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.is_enabled}
                onChange={async (e) => {
                  const is_enabled = e.target.checked;
                  setFields((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_enabled } : x)));
                  await supabase.from("fields").update({ is_enabled }).eq("id", f.id);
                  await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                }}
              />
              Enabled
            </label>
            <label className="inline-flex items-center gap-1">
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
                }}
              />
              Main
            </label>
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 rounded border"
                onClick={async () => {
                  const up = fields[idx-1];
                  if (!up) return;
                  await supabase.from("fields").update({ sort_order: up.sort_order }).eq("id", f.id);
                  await supabase.from("fields").update({ sort_order: f.sort_order }).eq("id", up.id);
                  await load();
                  await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                }}
              >↑</button>
              <button
                className="px-2 py-1 rounded border"
                onClick={async () => {
                  const down = fields[idx+1];
                  if (!down) return;
                  await supabase.from("fields").update({ sort_order: down.sort_order }).eq("id", f.id);
                  await supabase.from("fields").update({ sort_order: f.sort_order }).eq("id", down.id);
                  await load();
                  await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
                }}
              >↓</button>
            </div>
            <button
              className="px-2 py-1 rounded border text-red-700"
              onClick={async () => {
                if (!window.confirm("Delete field?")) return;
                const { error } = await supabase.from("fields").delete().eq("id", f.id);
                if (error) alert(error.message);
                await load();
                await supabase.channel("fields-realtime-admin").send({ type: "broadcast", event: "fields_changed", payload: {} });
              }}
            >Delete</button>
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
    <div className="flex items-center gap-2 text-sm">
      <span>{labels.selectiveReset}:</span>
      {fields.map((f) => (
        <label key={f.id} className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={!!selected[f.id]}
            onChange={(e) => setSelected((prev) => ({ ...prev, [f.id]: e.target.checked }))}
          />
          {f.name}
        </label>
      ))}
      <button
        className="px-3 py-1.5 rounded border hover:bg-black/5"
        onClick={async () => {
          const confirmed = window.confirm(
            (labels.lang === "العربية"
              ? "هل أنت متأكد من إعادة التعيين المحدد؟ سيتم حفظ نسخة CSV تلقائيًا."
              : "Are you sure you want to selectively reset? A CSV backup will be downloaded automatically.")
          );
          if (!confirmed) return;
          // Export CSV first
          const { data } = await supabase
            .from("attendees")
            .select("*");
          const rows = data ?? [];
          const header = [
            "id","name","record_number","governorate","district","area","phone","quantity",
            "main_entrance_at","medical_check_at","dental_check_at","stationary_backpack_at","created_at"
          ];
          const csv = [
            header.join(","),
            ...rows.map((r: any) => [
              r.id, JSON.stringify(r.name), r.record_number, JSON.stringify(r.governorate), JSON.stringify(r.district), JSON.stringify(r.area),
              r.phone ?? "", r.quantity, r.main_entrance_at ?? "", r.medical_check_at ?? "", r.dental_check_at ?? "", r.stationary_backpack_at ?? "", r.created_at
            ].join(","))
          ].join("\n");
          const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `attendees-backup-before-selective-reset.csv`;
          a.click();
          URL.revokeObjectURL(url);

          // Then reset selectively
          const ids = Object.entries(selected)
            .filter(([, v]) => v)
            .map(([id]) => id);
          if (ids.length === 0) return;
          await supabase.rpc("reset_attendance_selective", { p_field_ids: ids });
        }}
      >
        OK
      </button>
    </div>
  );
}

