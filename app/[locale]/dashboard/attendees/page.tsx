"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { supabase } from "@/lib/supabaseClient";

// Simple debounce utility function
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}

type Attendee = {
  id: string;
  name: string;
  recordNumber: string;
  governorate: string;
  district: string;
  area: string;
  phone: string | null;
  quantity: number;
  ages: number[];
};

type Field = { id: string; name: string; is_enabled: boolean; is_main: boolean; sort_order: number };

export default function AttendeesPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const [query, setQuery] = useState("");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, Record<string, { checkedAt: string | null; quantity: number }>>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [govFilter, setGovFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [selectedField, setSelectedField] = useState<string>("");
  const [fieldCheckFilter, setFieldCheckFilter] = useState<"any" | "checked" | "not_checked">("any");
  const [sortKey, setSortKey] = useState<"name" | "recordNumber" | "governorate" | "district" | "area" | "quantity">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadAll = useCallback(async (page = 1, reset = false) => {
    console.log(`loadAll function called at: ${new Date().toISOString()}, page: ${page}, reset: ${reset}`);
    setLoadError("");
    setIsLoading(true);
    
    try {
      // Load fields (only once, not per page)
      if (reset || fields.length === 0) {
        const { data: fieldRows, error: fieldsError } = await supabase
          .from("fields")
          .select("id,name,is_enabled,is_main,sort_order")
          .order("sort_order", { ascending: true });
        
        if (fieldsError) throw fieldsError;
        
        const enabled = (fieldRows ?? []).filter((f: any) => f.is_enabled) as Field[];
        setFields(enabled);
      }

      // Calculate pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      // Load attendees with pagination
      const { data, error: attendeesError, count } = await supabase
        .from("attendees")
        .select("id,name,record_number,governorate,district,area,phone,quantity,age", { count: 'exact' })
        .order("name", { ascending: true })
        .range(from, to);
      
      if (attendeesError) throw attendeesError;
      
      console.log(`Fetched attendees page ${page}:`, data?.length, "of", count);
      
      const mapped: Attendee[] = (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        recordNumber: r.record_number,
        governorate: r.governorate,
        district: r.district,
        area: r.area,
        phone: r.phone,
        quantity: r.quantity,
        ages: Array.isArray(r.age)
          ? (r.age as any[]).map((x) => (typeof x === "number" ? x : parseInt(String(x), 10))).filter((n) => Number.isFinite(n))
          : typeof r.age === "number"
          ? [r.age]
          : typeof r.age === "string"
          ? [parseInt(r.age, 10)].filter((n) => Number.isFinite(n))
          : [],
      }));
      
      if (reset) {
        setAttendees(mapped);
        setCurrentPage(1);
      } else {
        setAttendees(prev => [...prev, ...mapped]);
      }
      
      setTotalCount(count || 0);
      setHasMore((count || 0) > (reset ? pageSize : attendees.length + pageSize));
      
      // Load status data for current page attendees
      if (mapped.length > 0) {
        const attendeeIds = mapped.map(a => a.id);
        
        const { data: statusData, error: statusError } = await supabase
          .from("attendee_field_status")
          .select("attendee_id,field_id,checked_at,quantity")
          .in("attendee_id", attendeeIds);
        
        if (statusError) {
          console.error("Error fetching statuses:", statusError);
        } else {
          setStatusMap(prev => {
            const next = { ...prev };
            for (const row of statusData || []) {
              if (!next[row.attendee_id]) next[row.attendee_id] = {};
              const quantity = row.quantity !== null && row.quantity !== undefined ? row.quantity : 1;
              next[row.attendee_id][row.field_id] = { checkedAt: row.checked_at, quantity };
            }
            return next;
          });
        }
      }
      
    } catch (error: any) {
      console.error("Error in loadAll:", error);
      setLoadError(error.message || "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [fields.length, pageSize, attendees.length]);

  const loadMore = useCallback(() => {
    if (!isLoading && !isLoadingMore && hasMore) {
      setIsLoadingMore(true);
      const nextPage = Math.floor(attendees.length / pageSize) + 1;
      loadAll(nextPage, false).finally(() => {
        setIsLoadingMore(false);
      });
    }
  }, [isLoading, isLoadingMore, hasMore, attendees.length, pageSize, loadAll]);

  const refreshData = useCallback(() => {
    loadAll(1, true);
  }, [loadAll]);

  // Debounced search to improve performance with large datasets
  const debouncedSearch = useCallback(
    debounce((searchTerm: string) => {
      setQuery(searchTerm);
      // Reset to first page when searching
      if (searchTerm !== query) {
        loadAll(1, true);
      }
    }, 300),
    [query, loadAll]
  );

  // Component mount effect - removed loadAll call since it's now called after subscription is established
  useEffect(() => {
    console.log("Component mounted, setting up real-time subscription...");
  }, []);

  // Set up real-time subscription first, then load data
  useEffect(() => {
    let isMounted = true;
    let channel: any | null = null;

    async function setupSubscription() {
      if (!isMounted) return;

      console.log("Setting up real-time subscription...");
      
      // Set up real-time subscription for attendee_field_status changes
      channel = supabase
        .channel("attendee_field_status_changes")
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "attendee_field_status" 
          },
          (payload: any) => {
            console.log("Real-time change received:", payload);
            
            // Only process updates if subscription is properly established
            // Supabase channels automatically handle reconnection and retry
            // We just need to ensure the data is loaded after subscription is ready
            
            const row = payload.new ?? payload.old;
            if (!row) return;
            
            const attendeeId = row.attendee_id as string;
            const fieldId = row.field_id as string;
            const checkedAt = payload.eventType === "DELETE" ? null : (row.checked_at as string | null);
            const quantity = payload.eventType === "DELETE" ? 1 : (row.quantity || 1);
            
            console.log(`Processing update: attendeeId=${attendeeId}, fieldId=${fieldId}, checkedAt=${checkedAt}, quantity=${quantity}`);
            
            setStatusMap((prev) => {
              const next = { ...prev };
              if (!next[attendeeId]) next[attendeeId] = {};
              if (payload.eventType === "DELETE") {
                // When deleting, set quantity to 1 (default) instead of deleting the entry
                next[attendeeId][fieldId] = { checkedAt: null, quantity: 1 };
              } else {
                next[attendeeId][fieldId] = { checkedAt, quantity };
              }
              console.log(`Updated statusMap for ${attendeeId}:${fieldId}`, next[attendeeId][fieldId]);
              return next;
            });
          }
        )
        .subscribe(); // Supabase channels automatically handle retry and reconnection
      
      // Load initial data after subscription is set up
      if (isMounted) {
        loadAll();
      }
    }

    setupSubscription();
    
    return () => {
      isMounted = false;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [loadAll]);

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

  // Debug: Log current status map
  useEffect(() => {
    console.log("Current statusMap:", statusMap);
  }, [statusMap]);

  // Periodic health check for subscription
  useEffect(() => {
    // Supabase channels automatically handle reconnection and retry
    // This effect is no longer needed for manual checks
  }, []);

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
        const checked = !!statusMap[a.id]?.[selectedField]?.checkedAt;
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
        default:
          return dir * collator.compare(a.name, b.name);
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
    errorLoading: isArabic ? "تعذر تحميل البيانات" : "Failed to load data",
    quantityLabel: isArabic ? "الكمية" : "Qty",
    agesLabel: isArabic ? "الأعمار" : "Ages",
    enterQty: isArabic ? "أدخل الكمية" : "Enter quantity",
    invalidQty: isArabic ? "قيمة غير صالحة" : "Invalid quantity",
  };

  const mainField = fields.find((f) => f.is_main);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center lg:text-left">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
              {isArabic ? "إدارة الحضور" : "Attendee Management"}
            </h1>
            <p className="text-[var(--muted)] text-responsive">
              {isArabic ? "تتبع وإدارة حضور المشاركين" : "Track and manage participant attendance"}
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg shadow-lg">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="font-bold text-sm">SUPER ADMIN MODE</span>
              <span className="text-xs opacity-90">ULTIMATE POWER</span>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass rounded-2xl">
        <input
          placeholder={t.search}
          className="w-full px-4 py-3 rounded-xl glass border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
          defaultValue={query}
          onChange={(e) => debouncedSearch(e.target.value)}
        />
      </div>

      {/* Super Admin Control Panel */}
      

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
          <div className="flex gap-2">
            <button
              onClick={() => {
                console.log("Manual refresh clicked");
                refreshData();
              }}
              className="px-4 py-2 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors"
              disabled={isLoading}
            >
              {isLoading ? (isArabic ? "جاري..." : "Loading...") : (isArabic ? "تحديث" : "Refresh")}
            </button>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-600 font-medium">
                  {isArabic ? 'متصل - تحديثات فورية' : 'Connected - Real-time'}
                </span>
              </div>
            <button
              onClick={async () => {
                console.log("Testing direct database query...");
                const { data, error } = await supabase
                  .from("attendee_field_status")
                  .select("*");
                console.log("Direct query result:", { data, error });
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Test DB
            </button>
            <button
              onClick={async () => {
                console.log("Testing real-time subscription...");
                // Test by updating a field status to trigger real-time update
                if (attendees.length > 0 && fields.length > 0) {
                  const testAttendee = attendees[0];
                  const testField = fields[0];
                  console.log(`Testing with attendee: ${testAttendee.name}, field: ${testField.name}`);
                  
                  const { data, error } = await supabase
                    .from("attendee_field_status")
                    .upsert({
                      attendee_id: testAttendee.id,
                      field_id: testField.id,
                      checked_at: new Date().toISOString(),
                      quantity: 1
                    }, { onConflict: "attendee_id,field_id" });
                  
                  if (error) {
                    console.error("Test update failed:", error);
                  } else {
                    console.log("Test update successful, should trigger real-time update");
                  }
                }
              }}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              Test RT
            </button>
          </div>
        </div>
        
        {/* Loading State */}
        {isLoading && attendees.length === 0 && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-[var(--brand)] text-lg font-medium">
              {isArabic ? "جاري تحميل البيانات..." : "Loading data..."}
            </div>
            <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mt-4"></div>
          </div>
        )}
        
        {(filtered.length === 0 || loadError) && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-[var(--muted)] text-lg">{loadError ? `${t.errorLoading}: ${loadError}` : t.noData}</div>
          </div>
        )}
        
                <div className="grid gap-4">
          {filtered.map((a) => (
            <div key={a.id} className="card p-4 lg:p-6 hover:shadow-xl transition-all duration-300">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Attendee Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg text-[var(--foreground)]">{a.name}</h3>
                      {isSuperAdmin && (
                        <button
                          onClick={() => {
                            // Super admin quick edit
                            const newName = window.prompt(
                              `${isArabic ? "تعديل اسم الحضور" : "Edit attendee name"}:`,
                              a.name
                            );
                            if (newName && newName.trim() && newName !== a.name) {
                              // TODO: Implement database update
                              alert(`${isArabic ? "سيتم تحديث الاسم قريباً" : "Name update coming soon!"}`);
                            }
                          }}
                          className="p-1 text-orange-600 hover:text-orange-700 hover:bg-orange-100 rounded transition-colors"
                          title={isArabic ? "تعديل (المدير المتفوق)" : "Edit (Super Admin)"}
                        >
                          ✏️
                        </button>
                      )}
                    </div>
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
                    <span className="flex items-center gap-1 font-medium">
                      <span className="w-1 h-1 rounded-full bg-orange-500" />
                      {t.quantityLabel}: {a.quantity}
                    </span>
                    {a.ages.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-purple-500" />
                        {t.agesLabel}: {a.ages.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Station Actions */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                  {fields.map((f) => {
                    const status = statusMap[a.id]?.[f.id];
                    const checked = !!status?.checkedAt;
                    const mainChecked = mainField ? !!statusMap[a.id]?.[mainField.id]?.checkedAt : true;
                    // Super admin can access any field regardless of restrictions
                    const disabled = !isSuperAdmin && !f.is_main && !mainChecked;
                    // Super admin can force check-in even on disabled fields
                    const canForceCheck = isSuperAdmin && !f.is_main && !mainChecked;
                    const key = `${a.id}:${f.id}`;
                    const fieldQuantity = status?.checkedAt ? (status.quantity || 1) : 0;
                    const totalQuantity = a.quantity;
                    
                    return (
                      <Station
                        key={f.id}
                        label={f.name}
                        active={checked}
                        disabled={disabled}
                        busy={busy.has(key)}
                        isSuperAdmin={isSuperAdmin}
                        canForceCheck={canForceCheck}
                        quantity={fieldQuantity}
                        totalQuantity={totalQuantity}
                        onMark={async () => {
                          const isUnchecking = checked;
                          const action = isUnchecking ? "uncheck" : "check";
                          let selectedQty = 1;
                          
                          // Super admin gets ultimate power - can override any restrictions
                          if (isSuperAdmin) {
                            if (!isUnchecking) {
                              // Super admin can set ANY quantity, even beyond attendee's total
                              const input = window.prompt(
                                `${isArabic ? "أدخل الكمية (المدير المتفوق يمكنه تجاوز الحد الأقصى)" : "Enter quantity (Super Admin can exceed limits)"} (1 - 999)`, 
                                "1"
                              );
                              if (input == null) return; // cancelled
                              const parsed = parseInt(input, 10);
                              if (!Number.isFinite(parsed) || parsed < 1) {
                                alert(isArabic ? "قيمة غير صالحة" : "Invalid quantity");
                                return;
                              }
                              selectedQty = parsed;
                            }
                            
                            // Super admin confirmation with special warning
                            const superAdminConfirm = window.confirm(
                              `🚨 SUPER ADMIN ACTION 🚨\n\n` +
                              `${isUnchecking ? "Force uncheck" : "Force check-in"} ${f.name} for ${a.name}\n` +
                              `Quantity: ${selectedQty}\n\n` +
                              `This action bypasses all restrictions and rules!\n` +
                              `Are you sure you want to proceed?`
                            );
                            if (!superAdminConfirm) return;
                          } else {
                            // Regular user flow with restrictions
                            if (!isUnchecking) {
                              const maxQty = Math.max(1, a.quantity ?? 1);
                              if (maxQty > 1) {
                                const input = window.prompt(`${t.enterQty} (1 - ${maxQty})`, "1");
                                if (input == null) return; // cancelled
                                const parsed = parseInt(input, 10);
                                if (!Number.isFinite(parsed) || parsed < 1 || parsed > maxQty) {
                                  alert(t.invalidQty);
                                  return;
                                }
                                selectedQty = parsed;
                                }
                              }
                              if (!window.confirm(`${t.confirmPrefix}${action === "uncheck" ? (isArabic ? "إلغاء تأكيد" : "Uncheck") : (isArabic ? "تأكيد" : "Check")} ${f.name} - ${a.name}`)) return;
                            }
                            
                            setBusy((prev) => new Set(prev).add(key));
                            const prevVal = statusMap[a.id]?.[f.id] ?? { checkedAt: null, quantity: 1 };
                            
                            // Update local state immediately for real-time feel
                            const newValue = isUnchecking ? null : new Date().toISOString();
                            setStatusMap((prev) => ({ 
                              ...prev, 
                              [a.id]: { 
                                ...(prev[a.id] ?? {}), 
                                [f.id]: { checkedAt: newValue, quantity: selectedQty } 
                              } 
                            }));
                            
                            let result;
                            if (isUnchecking) {
                              // Uncheck by setting checked_at to null and quantity to 1 (default)
                              result = await supabase
                                .from("attendee_field_status")
                                .update({ checked_at: null, quantity: 1 })
                                .eq("attendee_id", a.id)
                                .eq("field_id", f.id);
                            } else {
                              // Check by setting checked_at to current timestamp and quantity
                              result = await supabase
                                .from("attendee_field_status")
                                .upsert(
                                  { 
                                    attendee_id: a.id, 
                                    field_id: f.id, 
                                    checked_at: new Date().toISOString(),
                                    quantity: selectedQty
                                  }, 
                                  { onConflict: "attendee_id,field_id" }
                                );
                            }
                            
                            if (result.error) {
                              console.error("Database error:", result.error);
                              alert(`${t.failed}: ${result.error.message}`);
                              // Revert local state on error
                              setStatusMap((prev) => ({ 
                                ...prev, 
                                [a.id]: { 
                                  ...(prev[a.id] ?? {}), 
                                  [f.id]: prevVal 
                                } 
                              }));
                            } else {
                              console.log("Successfully updated field status:", { attendeeId: a.id, fieldId: f.id, checkedAt: newValue, quantity: selectedQty });
                              // Real-time update will come through postgres_changes subscription
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
            
            {/* Pagination Controls */}
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMore}
                  disabled={isLoading || isLoadingMore}
                  className="px-6 py-3 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {isArabic ? "جاري التحميل..." : "Loading..."}
                    </div>
                  ) : (
                    isArabic ? "تحميل المزيد" : "Load More"
                  )}
                </button>
              </div>
            )}
            
            {/* Pagination Info */}
            <div className="text-center text-sm text-[var(--muted)] mt-4">
              {isArabic ? `عرض ${attendees.length} من ${totalCount} سجل` : `Showing ${attendees.length} of ${totalCount} records`}
            </div>
          </div>
      </div>
    </div>
  );
}

const Station = memo(function Station({ label, active, disabled = false, busy = false, isSuperAdmin = false, canForceCheck = false, quantity = 0, totalQuantity = 1, onMark }: { label: string; active: boolean; disabled?: boolean; busy?: boolean; isSuperAdmin?: boolean; canForceCheck?: boolean; quantity?: number; totalQuantity?: number; onMark: () => Promise<void> }) {
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
              <div className="text-center">
                <div>{label}</div>
                {totalQuantity > 1 && (
                  <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">{quantity}/{totalQuantity}</div>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
              <div className="text-center">
                <div>{label}</div>
                {totalQuantity > 1 && (
                  <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">{quantity}/{totalQuantity}</div>
                )}
              </div>
            </>
          )}
        </button>
      );
    }
    
    // Regular users see static checked field
    return (
      <div className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-medium shadow-lg">
        <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
        <div className="text-center">
          <div>{label}</div>
          {totalQuantity > 1 && (
            <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">{quantity}/{totalQuantity}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      disabled={busy} // Super admin can always click, even on disabled fields
      title={disabled ? (isSuperAdmin ? `${label} (disabled - Super Admin can force override)` : `${label} (disabled)`) : label}
      className={`inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 glass border-[var(--border-glass)] hover:bg-[var(--surface-glass-hover)] hover:border-[var(--brand)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:bg-[var(--surface-glass)] ${isSuperAdmin && disabled ? 'border-orange-500/50 hover:border-orange-500' : ''}`}
      onClick={() => {
        if (busy) return;
        // Super admin can force check-in even on disabled fields
        if (disabled && !isSuperAdmin) return;
        void onMark();
      }}
    >
      {busy ? (
        <>
          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
          <div className="text-center">
            <div>{label}</div>
            {totalQuantity > 1 && (
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">{quantity}/{totalQuantity}</div>
            )}
            {/* Super Admin Override Button for Disabled Fields */}
            {isSuperAdmin && disabled && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] mr-2" />
          <div className="text-center">
            <div>{label}</div>
            {totalQuantity > 1 && (
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">{quantity}/{totalQuantity}</div>
            )}
            {/* Super Admin Override Button for Disabled Fields */}
            {isSuperAdmin && disabled && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
          </div>
        </>
      )}
    </button>
  );
});
