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
  createdAt: string;
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
  const [govFilter, setGovFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [selectedField, setSelectedField] = useState<string>("");
  const [fieldCheckFilter, setFieldCheckFilter] = useState<"any" | "checked" | "not_checked">("any");
  const [sortKey, setSortKey] = useState<"createdAt" | "name" | "recordNumber" | "governorate" | "district" | "area" | "quantity">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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
        .select("id,name,record_number,governorate,district,area,phone,quantity,created_at")
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
        createdAt: r.created_at,
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
        .channel("app")
        .on("postgres_changes", { event: "*", schema: "public", table: "attendees" }, () => loadAll())
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendee_field_status" },
          (payload: any) => {
            const row = payload.new ?? payload.old;
            if (!row) return loadAll();
            const attendeeId = row.attendee_id as string;
            const fieldId = row.field_id as string;
            const checkedAt = payload.eventType === "DELETE" ? null : (row.checked_at as string | null);
            setStatusMap((prev) => {
              const next = { ...prev } as Record<string, Record<string, string | null>>;
              next[attendeeId] = { ...(next[attendeeId] ?? {}) };
              next[attendeeId][fieldId] = checkedAt;
              return next;
            });
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "fields" },
          () => loadAll()
        )
        .on("broadcast", { event: "afs_changed" }, (msg: any) => {
          const { attendeeId, fieldId, checkedAt } = msg.payload ?? {};
          if (!attendeeId || !fieldId) return;
          setStatusMap((prev) => {
            const next = { ...prev } as Record<string, Record<string, string | null>>;
            next[attendeeId] = { ...(next[attendeeId] ?? {}) };
            next[attendeeId][fieldId] = checkedAt ?? null;
            return next;
          });
        })
        .on("broadcast", { event: "fields_changed" }, () => loadAll())
        .subscribe();
    }

    init();
    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (!isMounted) return;
      setIsSuperAdmin(profile?.role === "super_admin");
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const locales = useMemo(() => (isArabic ? ["ar", "ar-u-co-gregory"] : ["en", "en-US"]), [isArabic]);
  const collator = useMemo(() => new Intl.Collator(locales[0], { numeric: true, sensitivity: "base" }), [locales]);

  const allGovernorates = useMemo(() => Array.from(new Set(attendees.map((a) => a.governorate))).sort(collator.compare), [attendees, collator]);
  const allDistricts = useMemo(
    () => Array.from(new Set(attendees.filter((a) => (govFilter ? a.governorate === govFilter : true)).map((a) => a.district))).sort(collator.compare),
    [attendees, govFilter, collator]
  );
  const allAreas = useMemo(
    () =>
      Array.from(
        new Set(
          attendees
            .filter((a) => (govFilter ? a.governorate === govFilter : true))
            .filter((a) => (districtFilter ? a.district === districtFilter : true))
            .map((a) => a.area)
        )
      ).sort(collator.compare),
    [attendees, govFilter, districtFilter, collator]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = attendees;

    // search
    if (q) list = list.filter((a) => [a.name, a.recordNumber, a.phone].some((v) => v && v.toLowerCase().includes(q)));

    // geo filters
    if (govFilter) list = list.filter((a) => a.governorate === govFilter);
    if (districtFilter) list = list.filter((a) => a.district === districtFilter);
    if (areaFilter) list = list.filter((a) => a.area === areaFilter);

    // field status filter
    if (selectedField && fieldCheckFilter !== "any") {
      list = list.filter((a) => {
        const checked = !!statusMap[a.id]?.[selectedField];
        return fieldCheckFilter === "checked" ? checked : !checked;
      });
    }

    // sort
    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return dir * collator.compare(a.name, b.name);
        case "recordNumber":
          return dir * collator.compare(a.recordNumber, b.recordNumber);
        case "governorate":
          return dir * collator.compare(a.governorate, b.governorate);
        case "district":
          return dir * collator.compare(a.district, b.district);
        case "area":
          return dir * collator.compare(a.area, b.area);
        case "quantity":
          return dir * (a.quantity - b.quantity);
        case "createdAt":
        default:
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
    });

    return sorted;
  }, [attendees, query, govFilter, districtFilter, areaFilter, selectedField, fieldCheckFilter, sortKey, sortDir, statusMap, collator]);

  const t = {
    search: isArabic ? "ابحث بالاسم أو رقم السجل أو رقم الهاتف" : "Search by name, record #, or phone",
    mark: isArabic ? "تأكيد" : "Mark",
    noData: isArabic ? "لا توجد سجلات" : "No records",
    confirmPrefix: isArabic ? "تأكيد: " : "Confirm: ",
    failed: isArabic ? "فشل التحديث" : "Update failed",
    filters: isArabic ? "تصفية" : "Filters",
    governorate: isArabic ? "المحافظة" : "Governorate",
    district: isArabic ? "القضاء" : "District",
    area: isArabic ? "المنطقة" : "Area",
    field: isArabic ? "المحطة" : "Field",
    any: isArabic ? "الكل" : "Any",
    checked: isArabic ? "مؤكد" : "Checked",
    notChecked: isArabic ? "غير مؤكد" : "Not checked",
    sortBy: isArabic ? "ترتيب حسب" : "Sort by",
    asc: isArabic ? "تصاعدي" : "Asc",
    desc: isArabic ? "تنازلي" : "Desc",
    createdAt: isArabic ? "تاريخ الإنشاء" : "Created at",
  };

  const mainField = fields.find((f) => f.is_main);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center lg:text-left">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
          {isArabic ? "إدارة الحضور" : "Attendee Management"}
        </h1>
        <p className="text-[var(--muted)] text-responsive">
          {isArabic ? "تتبع وإدارة حضور المشاركين" : "Track and manage participant attendance"}
        </p>
      </div>

      {/* Search Bar */}
      <div className="glass rounded-2xl">
        <input
          placeholder={t.search}
          className="w-full px-4 py-3 rounded-xl glass border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters Panel */}
      <div className="glass rounded-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 text-sm">
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.governorate}</label>
            <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={govFilter} onChange={(e) => { setGovFilter(e.target.value); setDistrictFilter(""); setAreaFilter(""); }}>
              <option value="">{t.any}</option>
              {allGovernorates.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.district}</label>
            <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={districtFilter} onChange={(e) => { setDistrictFilter(e.target.value); setAreaFilter(""); }}>
              <option value="">{t.any}</option>
              {allDistricts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.area}</label>
            <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="">{t.any}</option>
              {allAreas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.field}</label>
            <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={selectedField} onChange={(e) => setSelectedField(e.target.value)}>
              <option value="">{t.any}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{isArabic ? "الحالة" : "Status"}</label>
            <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={fieldCheckFilter} onChange={(e) => setFieldCheckFilter(e.target.value as any)}>
              <option value="any">{t.any}</option>
              <option value="checked">{t.checked}</option>
              <option value="not_checked">{t.notChecked}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.sortBy}</label>
              <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={sortKey} onChange={(e) => setSortKey(e.target.value as any)}>
                <option value="createdAt">{t.createdAt}</option>
                <option value="name">Name</option>
                <option value="recordNumber">Record #</option>
                <option value="governorate">{t.governorate}</option>
                <option value="district">{t.district}</option>
                <option value="area">{t.area}</option>
                <option value="quantity">Qty</option>
              </select>
            </div>
            <div>
              <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{isArabic ? "الاتجاه" : "Order"}</label>
              <select className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
                <option value="asc">{t.asc}</option>
                <option value="desc">{t.desc}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
            {isArabic ? "النتائج" : "Results"}
            <span className="text-sm font-normal text-[var(--muted)]">({filtered.length})</span>
          </h2>
        </div>
        
        {filtered.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-[var(--muted)] text-lg">{t.noData}</div>
          </div>
        )}
        
        <div className="grid gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="card p-4 lg:p-6 hover:shadow-xl transition-all duration-300">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Attendee Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <h3 className="font-semibold text-lg text-[var(--foreground)]">{a.name}</h3>
                    <span className="inline-flex items-center gap-1 text-sm text-[var(--muted)] font-mono">
                      <span className="w-1 h-1 rounded-full bg-[var(--muted)]" />
                      #{a.recordNumber}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                      {a.governorate}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                      {a.district}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                      {a.area}
                    </span>
                    {a.phone && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                        {a.phone}
                      </span>
                    )}
                    {a.quantity > 1 && (
                      <span className="flex items-center gap-1 font-medium">
                        <span className="w-1 h-1 rounded-full bg-orange-500" />
                        {isArabic ? `الكمية: ${a.quantity}` : `Qty: ${a.quantity}`}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Station Actions */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {fields.map((f) => {
                    const checked = !!statusMap[a.id]?.[f.id];
                    const mainChecked = mainField ? !!statusMap[a.id]?.[mainField.id] : true;
                    const disabled = !isSuperAdmin && !f.is_main && !mainChecked;
                    const key = `${a.id}:${f.id}`;
                    return (
                      <Station
                        key={f.id}
                        label={f.name}
                        active={checked}
                        disabled={disabled}
                        busy={busy.has(key)}
                        isSuperAdmin={isSuperAdmin}
                        onMark={async () => {
                          const isUnchecking = checked;
                          const action = isUnchecking ? "uncheck" : "check";
                          const confirmText = isUnchecking 
                            ? (isArabic ? "إلغاء تأكيد" : "Uncheck") 
                            : (isArabic ? "تأكيد" : "Check");
                          if (!window.confirm(`${t.confirmPrefix}${confirmText} ${f.name} - ${a.name}`)) return;
                          
                          setBusy((prev) => new Set(prev).add(key));
                          const prevVal = statusMap[a.id]?.[f.id] ?? null;
                          
                          // Update local state immediately for real-time feel
                          const newValue = isUnchecking ? null : new Date().toISOString();
                          setStatusMap((prev) => ({ 
                            ...prev, 
                            [a.id]: { 
                              ...(prev[a.id] ?? {}), 
                              [f.id]: newValue 
                            } 
                          }));
                          
                          let result;
                          if (isUnchecking) {
                            // Uncheck by setting checked_at to null
                            result = await supabase
                              .from("attendee_field_status")
                              .update({ checked_at: null })
                              .eq("attendee_id", a.id)
                              .eq("field_id", f.id);
                          } else {
                            // Check by setting checked_at to current timestamp
                            result = await supabase
                              .from("attendee_field_status")
                              .upsert(
                                { 
                                  attendee_id: a.id, 
                                  field_id: f.id, 
                                  checked_at: new Date().toISOString() 
                                }, 
                                { onConflict: "attendee_id,field_id" }
                              );
                          }
                          
                          if (result.error) {
                            alert(t.failed);
                            // Revert local state on error
                            setStatusMap((prev) => ({ 
                              ...prev, 
                              [a.id]: { 
                                ...(prev[a.id] ?? {}), 
                                [f.id]: prevVal 
                              } 
                            }));
                          } else {
                            // Broadcast the change for real-time updates
                            await supabase
                              .channel("app")
                              .send({ 
                                type: "broadcast", 
                                event: "afs_changed", 
                                payload: { 
                                  attendeeId: a.id, 
                                  fieldId: f.id, 
                                  checkedAt: newValue 
                                } 
                              });
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Station({ label, active, disabled = false, busy = false, isSuperAdmin = false, onMark }: { label: string; active: boolean; disabled?: boolean; busy?: boolean; isSuperAdmin?: boolean; onMark: () => Promise<void> }) {
  if (active) {
    // If super admin, make checked fields clickable to uncheck
    if (isSuperAdmin) {
      return (
        <button
          disabled={busy}
          title={`${label} (click to uncheck)`}
          className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium shadow-lg hover:from-green-600 hover:to-green-700 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
          onClick={() => {
            if (busy) return;
            void onMark();
          }}
        >
          {busy ? (
            <>
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin mr-2" />
              {label}
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
              {label}
            </>
          )}
        </button>
      );
    }
    
    // Regular users see static checked field
    return (
      <div className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium shadow-lg">
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
        {label}
      </div>
    );
  }

  return (
    <button
      disabled={disabled || busy}
      title={disabled ? `${label} (disabled)` : label}
      className="inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 glass border-[var(--border-glass)] hover:bg-[var(--surface-glass-hover)] hover:border-[var(--brand)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[var(--surface-glass)]"
      onClick={() => {
        if (disabled || busy) return;
        void onMark();
      }}
    >
      {busy ? (
        <>
          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
          {label}
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] mr-2" />
          {label}
        </>
      )}
    </button>
  );
}
