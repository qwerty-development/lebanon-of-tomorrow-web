"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { UserRole, canUserModifyField } from "@/lib/roleUtils";

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
  batch: string;
  preCollected: boolean;
};

type Field = { 
  id: string; 
  name: string; 
  is_enabled: boolean; 
  is_main: boolean; 
  sort_order: number;
};

type AttendeeWithStatus = Attendee & {
  fieldStatuses: Record<string, { checkedAt: string | null; quantity: number }>;
};

// Constants for pagination and performance
const PAGE_SIZE = 50;
const DEBOUNCE_DELAY = 300;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Debounce hook for search optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Retry mechanism for database operations
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

export default function AttendeesPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  // Search and filtering state
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY);
  const [govFilter, setGovFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [selectedField, setSelectedField] = useState<string>("");
  const [batchFilter, setBatchFilter] = useState<"active" | "south" | "all">("active");
  const [fieldCheckFilter, setFieldCheckFilter] = useState<"any" | "checked" | "not_checked">("any");

  // Sorting state
  const [sortKey, setSortKey] = useState<"name" | "recordNumber" | "governorate" | "district" | "area" | "quantity">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Data state
  const [attendees, setAttendees] = useState<AttendeeWithStatus[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [locationTriples, setLocationTriples] = useState<
    { governorate: string; district: string; area: string }[]
  >([]);

  // UI state
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('admin');
  const [loadError, setLoadError] = useState<string>("");
  const [isOnline, setIsOnline] = useState(true);

  // Refs for cleanup and optimization
  const abortControllerRef = useRef<AbortController | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // Translations
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
    loadMore: isArabic ? "تحميل المزيد" : "Load More",
    offline: isArabic ? "غير متصل" : "Offline",
    retry: isArabic ? "إعادة المحاولة" : "Retry",
    list: isArabic ? "القائمة" : "List",
    listActive: isArabic ? "التوزيع الحالي" : "Current distribution",
    listSouth: isArabic ? "الجنوب (تم الاستلام)" : "South (already collected)",
    listAll: isArabic ? "الكل" : "All",
    collectedBadge: isArabic ? "تم الاستلام مسبقاً — الجنوب" : "ALREADY COLLECTED — SOUTH",
    collectedNote: isArabic
      ? "استلمت هذه العائلة في توزيع الجنوب. لا يمكن تسجيل المحطات."
      : "Collected in the south distribution. Stations are locked.",
  };

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load fields and location data (static data)
  const loadStaticData = useCallback(async () => {
    try {
      // Load fields
      const { data: fieldRows, error: fieldsError } = await supabase
        .from("fields")
        .select("id,name,is_enabled,is_main,sort_order")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (fieldsError) throw fieldsError;
      setFields(fieldRows || []);

      // One tiny RPC instead of pulling every attendee row just to build dropdowns.
      const { data: triples, error: locationError } = await supabase.rpc("attendee_filter_options");
      if (locationError) throw locationError;
      setLocationTriples((triples as any[]) || []);
    } catch (error) {
      console.error("Error loading static data:", error);
      setLoadError((error as Error).message);
    }
  }, []);

  // Optimized data loading with pagination
  const loadAttendees = useCallback(async (
    page: number = 1,
    append: boolean = false,
    signal?: AbortSignal
  ) => {
    if (!append) {
      setLoading(true);
      setLoadError("");
    } else {
      setLoadingMore(true);
    }

    try {
      // Everything (filter + page + per-attendee statuses) in ONE round trip.
      const { data, error } = await supabase.rpc("search_attendees", {
        p_query: debouncedQuery || null,
        p_governorate: govFilter || null,
        p_district: districtFilter || null,
        p_area: areaFilter || null,
        p_batch: batchFilter,
        p_field_id: selectedField || null,
        p_field_state: selectedField ? fieldCheckFilter : "any",
        p_sort: sortKey === "recordNumber" ? "record_number" : sortKey,
        p_dir: sortDir,
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      });

      if (signal?.aborted) return;
      if (error) throw error;

      const total = ((data as any)?.total as number) ?? 0;
      const transformed: AttendeeWithStatus[] = (((data as any)?.rows ?? []) as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        recordNumber: r.record_number,
        governorate: r.governorate,
        district: r.district,
        area: r.area,
        phone: r.phone,
        quantity: r.quantity,
        batch: r.batch,
        preCollected: !!r.pre_collected,
        ages: Array.isArray(r.age)
          ? (r.age as any[])
              .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
              .filter((v) => Number.isFinite(v))
          : typeof r.age === "number"
          ? [r.age]
          : [],
        fieldStatuses: Object.fromEntries(
          Object.entries((r.statuses ?? {}) as Record<string, any>).map(([fid, st]) => [
            fid,
            { checkedAt: st?.checked_at ?? null, quantity: st?.quantity ?? 1 },
          ])
        ),
      }));

      setAttendees((prev) => (append ? [...prev, ...transformed] : transformed));
      setTotalCount(total);
      setHasMore(total > page * PAGE_SIZE);

    } catch (error) {
      if (signal?.aborted) return;
      console.error("Error loading attendees:", error);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQuery, govFilter, districtFilter, areaFilter, batchFilter, selectedField, fieldCheckFilter, sortKey, sortDir]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setAttendees([]);
    setHasMore(true);
  }, [debouncedQuery, govFilter, districtFilter, areaFilter, batchFilter, selectedField, fieldCheckFilter, sortKey, sortDir]);

  // Load data when page changes
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const append = currentPage > 1;
    loadAttendees(currentPage, append, abortControllerRef.current.signal);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [currentPage, loadAttendees]);

  // Setup real-time subscriptions (optimized)
  useEffect(() => {
    const setupRealtime = () => {
      realtimeChannelRef.current = supabase
        .channel("attendee_field_status_changes")
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "attendee_field_status" 
          },
          (payload: any) => {
            const row = payload.new ?? payload.old;
            if (!row) return;
            
            const attendeeId = row.attendee_id as string;
            const fieldId = row.field_id as string;
            const checkedAt = payload.eventType === "DELETE" ? null : (row.checked_at as string | null);
            const quantity = payload.eventType === "DELETE" ? 1 : (row.quantity || 1);
            
            // Update only if attendee is in current view
            setAttendees(prev => prev.map(attendee => {
              if (attendee.id === attendeeId) {
                return {
                  ...attendee,
                  fieldStatuses: {
                    ...attendee.fieldStatuses,
                    [fieldId]: { checkedAt, quantity }
                  }
                };
              }
              return attendee;
            }));
          }
        )
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "fields" 
          },
          (payload: any) => {
            // Reload fields when they change (enabled/disabled status)
            loadStaticData();
          }
        )
        .subscribe();
    };

    if (isOnline) {
      setupRealtime();
    }

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [isOnline, loadStaticData]);

  // Load static data on mount
  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  // Check user role
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user || !isMounted) return;
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
          
        if (isMounted && profile) {
          setUserRole(profile.role);
          setIsSuperAdmin(profile.role === "super_admin");
        }
      } catch (error) {
        console.error("Error checking user role:", error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Optimized mark/unmark function
  const handleMarkField = useCallback(async (
    attendee: AttendeeWithStatus,
    field: Field,
    selectedQty: number = 1
  ) => {
    const key = `${attendee.id}:${field.id}`;
    const currentStatus = attendee.fieldStatuses[field.id];
    const isUnchecking = !!currentStatus?.checkedAt;

    setBusy(prev => new Set(prev).add(key));

    try {
      const result = await withRetry(async () => {
        if (isUnchecking) {
          return await supabase
            .from("attendee_field_status")
            .update({ checked_at: null, quantity: 1 })
            .eq("attendee_id", attendee.id)
            .eq("field_id", field.id);
        } else {
          return await supabase
            .from("attendee_field_status")
            .upsert(
              { 
                attendee_id: attendee.id, 
                field_id: field.id, 
                checked_at: new Date().toISOString(),
                quantity: selectedQty
              }, 
              { onConflict: "attendee_id,field_id" }
            );
        }
      });

      if (result.error) {
        throw result.error;
      }

      // Optimistic update will be handled by real-time subscription
    } catch (error) {
      console.error("Database error:", error);
      alert(`${t.failed}: ${(error as Error).message}`);
    } finally {
      setBusy(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [t.failed]);

  const mainField = fields.find(f => f.is_main);

  // Dropdowns cascade off real gov->district->area combinations.
  const governorates = useMemo(
    () => Array.from(new Set(locationTriples.map(t => t.governorate).filter(Boolean))).sort(),
    [locationTriples]
  );
  const districts = useMemo(
    () => Array.from(new Set(
      locationTriples.filter(t => !govFilter || t.governorate === govFilter)
                     .map(t => t.district).filter(Boolean)
    )).sort(),
    [locationTriples, govFilter]
  );
  const areas = useMemo(
    () => Array.from(new Set(
      locationTriples
        .filter(t => (!govFilter || t.governorate === govFilter) &&
                     (!districtFilter || t.district === districtFilter))
        .map(t => t.area).filter(Boolean)
    )).sort(),
    [locationTriples, govFilter, districtFilter]
  );

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          <span className="font-medium">{t.offline}</span> - Changes will sync when connection is restored
        </div>
      )}

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
            </div>
          )}
        </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 text-sm">
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.list}</label>
            <select
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value as "active" | "south" | "all")}
            >
              <option value="active">{t.listActive}</option>
              <option value="south">{t.listSouth}</option>
              <option value="all">{t.listAll}</option>
            </select>
          </div>

          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.governorate}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={govFilter} 
              onChange={(e) => { 
                setGovFilter(e.target.value); 
                setDistrictFilter(""); 
                setAreaFilter(""); 
              }}
            >
              <option value="">{t.any}</option>
              {governorates.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          
          {/* Add other filter controls similarly */}
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.district}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={districtFilter} 
              onChange={(e) => { 
                setDistrictFilter(e.target.value); 
                setAreaFilter(""); 
              }}
              disabled={!govFilter}
            >
              <option value="">{t.any}</option>
              {districts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.area}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={areaFilter} 
              onChange={(e) => setAreaFilter(e.target.value)}
              disabled={!districtFilter}
            >
              <option value="">{t.any}</option>
              {areas.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.field}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={selectedField} 
              onChange={(e) => setSelectedField(e.target.value)}
            >
              <option value="">{t.any}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">Status</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={fieldCheckFilter} 
              onChange={(e) => setFieldCheckFilter(e.target.value as any)}
            >
              <option value="any">{t.any}</option>
              <option value="checked">{t.checked}</option>
              <option value="not_checked">{t.notChecked}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.sortBy}</label>
              <select 
                className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
                value={sortKey} 
                onChange={(e) => setSortKey(e.target.value as any)}
              >
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
              <select 
                className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
                value={sortDir} 
                onChange={(e) => setSortDir(e.target.value as any)}
              >
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
            <span className="text-sm font-normal text-[var(--muted)]">({totalCount})</span>
          </h2>
        </div>
        
        {/* Error State */}
        {loadError && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-red-600 text-lg mb-4">{t.errorLoading}: {loadError}</div>
            <button
              onClick={() => {
                setLoadError("");
                setCurrentPage(1);
                loadAttendees(1);
              }}
              className="px-4 py-2 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors"
            >
              {t.retry}
            </button>
          </div>
        )}
        
        {/* Loading State */}
        {loading && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-[var(--muted)] text-lg">Loading...</div>
          </div>
        )}
        
        {/* Attendees List */}
        {!loading && attendees.length === 0 && !loadError && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-[var(--muted)] text-lg">{t.noData}</div>
          </div>
        )}
        
        <div className="grid gap-4">
          {attendees.map((attendee) => (
            <AttendeeCard
              key={attendee.id}
              attendee={attendee}
              fields={fields}
              mainField={mainField}
              isSuperAdmin={isSuperAdmin}
              userRole={userRole}
              busy={busy}
              onMarkField={handleMarkField}
              translations={t}
              isArabic={isArabic}
            />
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-3 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
                  Loading...
                </>
              ) : (
                t.loadMore
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Optimized Attendee Card Component
function AttendeeCard({
  attendee,
  fields,
  mainField,
  isSuperAdmin,
  userRole,
  busy,
  onMarkField,
  translations: t,
  isArabic
}: {
  attendee: AttendeeWithStatus;
  fields: Field[];
  mainField?: Field;
  isSuperAdmin: boolean;
  userRole: UserRole;
  busy: Set<string>;
  onMarkField: (attendee: AttendeeWithStatus, field: Field, quantity?: number) => Promise<void>;
  translations: any;
  isArabic: boolean;
}) {
  return (
    <div className="card p-4 lg:p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Attendee Info */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h3 className="font-semibold text-lg text-[var(--foreground)]">{attendee.name}</h3>
            {attendee.preCollected && (
              <span
                title={t.collectedNote}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold
                           bg-[var(--muted)]/15 text-[var(--muted)] border border-[var(--muted)]/30"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)]" />
                {t.collectedBadge}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
            {attendee.phone && (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                {attendee.phone}
              </span>
            )}
            <span className="flex items-center gap-1 font-medium">
              <span className="w-1 h-1 rounded-full bg-orange-500" />
              {t.quantityLabel}: {attendee.quantity}
            </span>
            {attendee.ages.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-purple-500" />
                {t.agesLabel}: {attendee.ages.join(", ")}
              </span>
            )}
          </div>
        </div>
        
        {/* Station Actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {fields.map((field) => {
            const status = attendee.fieldStatuses[field.id];
            const checked = !!status?.checkedAt;
            const mainChecked = mainField ? !!attendee.fieldStatuses[mainField.id]?.checkedAt : true;
            const roleRestricted = !canUserModifyField(userRole, field.name);
            // Already served offline: nobody checks these in, super admin included.
            const locked = attendee.preCollected;
            const disabled = locked || (!isSuperAdmin && !field.is_main && !mainChecked) || roleRestricted;
            const key = `${attendee.id}:${field.id}`;
            const fieldQuantity = status?.checkedAt ? (status.quantity || 1) : 0;
            
            return (
              <Station
                key={field.id}
                label={field.name}
                active={checked}
                disabled={disabled}
                busy={busy.has(key)}
                locked={locked}
                isSuperAdmin={isSuperAdmin}
                userRole={userRole}
                fieldName={field.name}
                quantity={fieldQuantity}
                totalQuantity={attendee.quantity}
                onMark={async () => {
                  const isUnchecking = checked;
                  let selectedQty = 1;
                  
                  if (isSuperAdmin) {
                    if (!isUnchecking) {
                      const input = window.prompt(
                        `${isArabic ? "أدخل الكمية (المدير المتفوق يمكنه تجاوز الحد الأقصى)" : "Enter quantity (Super Admin can exceed limits)"} (1 - 999)`, 
                        "1"
                      );
                      if (input == null) return;
                      const parsed = parseInt(input, 10);
                      if (!Number.isFinite(parsed) || parsed < 1) {
                        alert(isArabic ? "قيمة غير صالحة" : "Invalid quantity");
                        return;
                      }
                      selectedQty = parsed;
                    }
                    
                    const superAdminConfirm = window.confirm(
                      `🚨 SUPER ADMIN ACTION 🚨\n\n` +
                      `${isUnchecking ? "Force uncheck" : "Force check-in"} ${field.name} for ${attendee.name}\n` +
                      `Quantity: ${selectedQty}\n\n` +
                      `This action bypasses all restrictions!\n` +
                      `Are you sure?`
                    );
                    if (!superAdminConfirm) return;
                  } else {
                    if (!isUnchecking) {
                      const maxQty = Math.max(1, attendee.quantity ?? 1);
                      if (maxQty > 1) {
                        const input = window.prompt(`${t.enterQty} (1 - ${maxQty})`, "1");
                        if (input == null) return;
                        const parsed = parseInt(input, 10);
                        if (!Number.isFinite(parsed) || parsed < 1 || parsed > maxQty) {
                          alert(t.invalidQty);
                          return;
                        }
                        selectedQty = parsed;
                      }
                    }
                    
                    const action = isUnchecking ? (isArabic ? "إلغاء تأكيد" : "Uncheck") : (isArabic ? "تأكيد" : "Check");
                    if (!window.confirm(`${t.confirmPrefix}${action} ${field.name} - ${attendee.name}`)) return;
                  }
                  
                  await onMarkField(attendee, field, selectedQty);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Optimized Station Component
function Station({ 
  label, 
  active, 
  disabled = false, 
  locked = false,
  busy = false, 
  isSuperAdmin = false, 
  userRole, 
  fieldName, 
  quantity = 0, 
  totalQuantity = 1, 
  onMark 
}: { 
  label: string; 
  active: boolean; 
  disabled?: boolean; 
  locked?: boolean;
  busy?: boolean; 
  isSuperAdmin?: boolean; 
  userRole?: UserRole; 
  fieldName?: string; 
  quantity?: number; 
  totalQuantity?: number; 
  onMark: () => Promise<void>;
}) {
  const canModify = !fieldName || !userRole || canUserModifyField(userRole, fieldName);
  const isDisabled = disabled || !canModify || locked;
  const roleRestricted = !canModify && userRole && !['admin', 'super_admin'].includes(userRole);
  
  const baseClasses = "inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200";
  
  if (active) {
    const activeClasses = isSuperAdmin 
      ? `${baseClasses} bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:from-green-600 hover:to-green-700 hover:scale-105 active:scale-95 cursor-pointer`
      : `${baseClasses} bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg`;
    
    return (
      <button
        disabled={busy || isDisabled}
        title={locked ? `${label} (already collected elsewhere)` : isSuperAdmin ? `${label} (click to uncheck)` : label}
        className={activeClasses}
        onClick={isSuperAdmin && !locked && !busy && !isDisabled ? onMark : undefined}
      >
        {busy ? (
          <>
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin mr-2" />
            <div className="text-center">
              <div>{label}</div>
              {totalQuantity > 1 && (
                <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">
                  {quantity}/{totalQuantity}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
            <div className="text-center">
              <div>{label}</div>
              {totalQuantity > 1 && (
                <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">
                  {quantity}/{totalQuantity}
                </div>
              )}
            </div>
          </>
        )}
      </button>
    );
  }

  const inactiveClasses = `${baseClasses} glass border-[var(--border-glass)] hover:bg-[var(--surface-glass-hover)] hover:border-[var(--brand)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${isSuperAdmin && isDisabled ? 'border-orange-500/50 hover:border-orange-500' : ''} ${roleRestricted ? 'border-red-500/50 hover:border-red-500' : ''}`;
  
  return (
    <button
      disabled={busy || locked || (isDisabled && !isSuperAdmin)}
      title={locked ? `${label} (already collected elsewhere)` : isDisabled ? (isSuperAdmin ? `${label} (disabled - Super Admin can override)` : roleRestricted ? `${label} (role restricted)` : `${label} (disabled)`) : label}
      className={inactiveClasses}
      onClick={!busy && !locked && !isDisabled ? onMark : undefined}
    >
      {busy ? (
        <>
          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
          <div className="text-center">
            <div>{label}</div>
            {totalQuantity > 1 && (
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">
                {quantity}/{totalQuantity}
              </div>
            )}
            {isSuperAdmin && isDisabled && !roleRestricted && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
            {roleRestricted && (
              <div className="text-xs text-red-600 font-bold mt-1 px-2 py-1 bg-red-100/50 rounded border border-red-300/50">
                ROLE RESTRICTED
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
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">
                {quantity}/{totalQuantity}
              </div>
            )}
            {isSuperAdmin && isDisabled && !roleRestricted && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
            {roleRestricted && (
              <div className="text-xs text-red-600 font-bold mt-1 px-2 py-1 bg-red-100/50 rounded border border-red-300/50">
                ROLE RESTRICTED
              </div>
            )}
          </div>
        </>
      )}
    </button>
  );
}