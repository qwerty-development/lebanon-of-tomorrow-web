"use client";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Attendee = {
  id: string;
  name: string;
  recordNumber: string;
  governorate: string;
  district: string;
  area: string;
  phone: string | null;
  quantity: number;
};

type Field = { id: string; name: string; is_enabled: boolean; is_main: boolean; sort_order: number };

export default function AttendeesPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const [query, setQuery] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, string | null>>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isMounted = true;
    let channel: any | null = null;

    async function loadAll() {
      const { data: fieldRows } = await supabase
        .from("fields")
        .select("id,name,is_enabled,is_main,sort_order")
        .order("sort_order", { ascending: true });
      const enabled = (fieldRows ?? []).filter((f: any) => f.is_enabled) as Field[];
      if (!isMounted) return;
      setFields(enabled);

      const { data } = await supabase
        .from("attendees")
        .select("id,name,record_number,governorate,district,area,phone,quantity")
        .order("created_at", { ascending: true });
      if (!isMounted) return;
      const mapped: Attendee[] = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        recordNumber: r.record_number,
        governorate: r.governorate,
        district: r.district,
        area: r.area,
        phone: r.phone,
        quantity: r.quantity,
      }));
      setAttendees(mapped);
      const ids = mapped.map((a) => a.id);
      if (ids.length) {
        const { data: statusRows } = await supabase
          .from("attendee_field_status")
          .select("attendee_id,field_id,checked_at")
          .in("attendee_id", ids);
        const map: Record<string, Record<string, string | null>> = {};
        for (const row of statusRows ?? []) {
          if (!map[row.attendee_id]) map[row.attendee_id] = {};
          map[row.attendee_id][row.field_id] = row.checked_at;
        }
        if (!isMounted) return;
        setStatusMap(map);
      } else {
        setStatusMap({});
      }
    }

    async function init() {
      await loadAll();
      channel = supabase
        .channel("attendance-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "attendees" }, () => loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "attendee_field_status" }, () => loadAll())
        .on("postgres_changes", { event: "*", schema: "public", table: "fields" }, () => loadAll())
        .subscribe();
    }

    init();
    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return attendees;
    return attendees.filter((a) => [a.name, a.recordNumber].some((v) => v.toLowerCase().includes(q)));
  }, [attendees, query]);

  const t = {
    search: isArabic ? "ابحث بالاسم أو رقم السجل" : "Search by name or record #",
    mark: isArabic ? "تأكيد" : "Mark",
    noData: isArabic ? "لا توجد سجلات" : "No records",
    confirmPrefix: isArabic ? "تأكيد: " : "Confirm: ",
    failed: isArabic ? "فشل التحديث" : "Update failed",
  };

  const mainField = fields.find((f) => f.is_main);

  return (
    <div className="space-y-4">
      <input
        placeholder={t.search}
        className="w-full px-3 py-2 rounded bg-[var(--surface-2)] border border-white/10"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="grid gap-3">
        {filtered.length === 0 && <div className="text-sm text-black/60">{t.noData}</div>}
        {filtered.map((a) => (
          <div key={a.id} className="card p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm">
              <div className="font-medium">{a.name}</div>
              <div className="text-black/70">#{a.recordNumber}</div>
              <div className="text-black/60">{a.governorate} • {a.district} • {a.area}</div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              {fields.map((f) => {
                const checked = !!statusMap[a.id]?.[f.id];
                const mainChecked = mainField ? !!statusMap[a.id]?.[mainField.id] : true;
                const disabled = !f.is_main && !mainChecked;
                const key = `${a.id}:${f.id}`;
                return (
                  <Station
                    key={f.id}
                    label={f.name}
                    active={checked}
                    disabled={disabled}
                    busy={busy.has(key) || disabled}
                    onMark={async () => {
                      if (!window.confirm(`${t.confirmPrefix}${f.name} - ${a.name}`)) return;
                      setBusy((prev) => new Set(prev).add(key));
                      const prevVal = statusMap[a.id]?.[f.id] ?? null;
                      setStatusMap((prev) => ({ ...prev, [a.id]: { ...(prev[a.id] ?? {}), [f.id]: new Date().toISOString() } }));
                      const { error } = await supabase
                        .from("attendee_field_status")
                        .upsert({ attendee_id: a.id, field_id: f.id, checked_at: new Date().toISOString() }, { onConflict: "attendee_id,field_id" });
                      if (error) {
                        alert(t.failed);
                        setStatusMap((prev) => ({ ...prev, [a.id]: { ...(prev[a.id] ?? {}), [f.id]: prevVal } }));
                      }
                      setBusy((prev) => {
                        const next = new Set(prev);
                        next.delete(key);
                        return next;
                      });
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Station({ label, active, disabled = false, busy = false, onMark }: { label: string; active: boolean; disabled?: boolean; busy?: boolean; onMark: () => Promise<void> }) {
  return active ? (
    <span className="inline-flex items-center justify-center px-2 py-1 rounded bg-green-600 text-white">{label}</span>
  ) : (
    <button
      disabled={disabled || busy}
      title={disabled ? label : undefined}
      className="inline-flex items-center justify-center px-2 py-1 rounded border hover:bg-black/5 disabled:opacity-50"
      onClick={() => {
        if (disabled || busy) return;
        void onMark();
      }}
    >
      {label}
    </button>
  );
}
