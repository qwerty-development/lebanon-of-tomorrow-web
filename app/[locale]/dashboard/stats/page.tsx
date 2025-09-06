"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function StatsPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const t = {
    title: isArabic ? "الإحصائيات" : "Statistics",
    total: isArabic ? "إجمالي المشاركين" : "Total attendees",
    totalItems: isArabic ? "إجمالي العناصر الموزعة" : "Total Items Distributed",
    mainEntranceItems: isArabic
      ? "إجمالي العناصر - المدخل الرئيسي"
      : "Main Entrance Items Total",
  };

  const [total, setTotal] = useState(0);
  const [fieldCounts, setFieldCounts] = useState<
    { id: string; name: string; accountCount: number; peopleCount: number; isMain: boolean }[]
  >([]);
  const [mainEntranceQuantity, setMainEntranceQuantity] = useState(0);
  const [totalQuantityDistributed, setTotalQuantityDistributed] = useState(0);

  useEffect(() => {
    let channel: any | null = null;
    async function load() {
      const { count: totalCount } = await supabase
        .from("attendees")
        .select("id", { count: "exact", head: true });
      setTotal(totalCount ?? 0);

      const { data: fieldRows } = await supabase
        .from("fields")
        .select("id,name,is_enabled,sort_order,is_main")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      const counts: { id: string; name: string; accountCount: number; peopleCount: number; isMain: boolean }[] = [];
      let mainEntranceQty = 0;
      let totalQtyDistributed = 0;

      for (const f of fieldRows ?? []) {
        // Get account count (number of check-ins) for this field
        const { count: accountCount } = await supabase
          .from("attendee_field_status")
          .select("attendee_id", { count: "exact", head: true })
          .eq("field_id", f.id)
          .not("checked_at", "is", null);

        // Get people count (sum of quantities) for this field
        const { data: quantityData } = await supabase
          .from("attendee_field_status")
          .select("quantity")
          .eq("field_id", f.id)
          .not("checked_at", "is", null);

        const peopleCount = quantityData?.reduce((sum, row) => sum + (row.quantity || 1), 0) || 0;
        totalQtyDistributed += peopleCount;

        if (f.is_main) {
          mainEntranceQty = peopleCount;
        }

        counts.push({ 
          id: f.id, 
          name: f.name, 
          accountCount: accountCount ?? 0, 
          peopleCount,
          isMain: f.is_main ?? false
        });
      }

      setFieldCounts(counts);
      setMainEntranceQuantity(mainEntranceQty);
      setTotalQuantityDistributed(totalQtyDistributed);
    }
    async function init() {
      await load();
      channel = supabase
        .channel("stats-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendees" },
          () => load()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendee_field_status" },
          () => load()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "fields" },
          () => load()
        )
        .subscribe();
    }
    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="text-center lg:text-left">
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
          {t.title}
        </h1>
        <p className="text-[var(--muted)] text-responsive">
          {isArabic
            ? "إحصائيات شاملة لحضور المشاركين"
            : "Comprehensive attendance statistics"}
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6">
        {/* Total Attendees Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-[var(--brand)]">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.total}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {total.toLocaleString()}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-600)] flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="flex items-center text-sm text-green-600 dark:text-green-400">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="font-medium">
                {isArabic ? "إجمالي المسجلين" : "Total registered"}
              </span>
            </div>
          </div>
        </div>

        {/* Main Entrance Items Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.mainEntranceItems}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {mainEntranceQuantity.toLocaleString()}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="hidden items-center text-sm text-green-600 dark:text-green-400">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <span className="font-medium">
                {isArabic ? "العناصر الموزعة" : "Items distributed"}
              </span>
            </div>
          </div>
        </div>

        {/* Total Items Distributed Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.totalItems}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {totalQuantityDistributed.toLocaleString()}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="flex items-center text-sm text-purple-600 dark:text-purple-400">
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              <span className="font-medium">
                {isArabic ? "إجمالي العناصر" : "Total items"}
              </span>
            </div>
          </div>
        </div>

        {/* Field Statistics Cards - All Fields */}
        {fieldCounts.map((f, index) => {
          // Adjust colors for all fields including main entrance
          const colors = [
            {
              from: "from-amber-500", // Different color for main entrance
              to: "to-amber-600",
              border: "border-l-amber-500",
            },
            {
              from: "from-green-500",
              to: "to-green-600",
              border: "border-l-green-500",
            },
            {
              from: "from-blue-500",
              to: "to-blue-600",
              border: "border-l-blue-500",
            },
            {
              from: "from-purple-500",
              to: "to-purple-600",
              border: "border-l-purple-500",
            },
            {
              from: "from-orange-500",
              to: "to-orange-600",
              border: "border-l-orange-500",
            },
            {
              from: "from-pink-500",
              to: "to-pink-600",
              border: "border-l-pink-500",
            },
            {
              from: "from-indigo-500",
              to: "to-indigo-600",
              border: "border-l-indigo-500",
            },
          ];
          
          // Use amber for main entrance (index 0), then cycle through other colors
          const colorSet = f.isMain ? colors[0] : colors[(index % (colors.length - 1)) + 1];
          const accountPercentage = total > 0 ? ((f.accountCount / total) * 100).toFixed(1) : "0";

          return (
            <div
              key={f.id}
              className={`card p-6 hover:shadow-xl transition-all duration-300 border-l-4 ${colorSet.border} ${f.isMain ? 'ring-2 ring-amber-200 dark:ring-amber-800' : ''}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--muted)] mb-2 flex items-center gap-2">
                    {f.name}
                    {f.isMain && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        {isArabic ? "رئيسي" : "Main"}
                      </span>
                    )}
                  </div>
                  <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                    {f.peopleCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {f.accountCount.toLocaleString()} {isArabic ? "حساب" : "accounts"}
                  </div>
                </div>
                <div
                  className={`w-12 h-12 rounded-full bg-gradient-to-br ${colorSet.from} ${colorSet.to} flex items-center justify-center`}
                >
                  <svg
                    className="w-6 h-6 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {f.isMain ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    )}
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-sm text-[var(--muted)]">
                    <span>
                      {f.peopleCount} {isArabic ? "شخص" : "people"}
                    </span>
                  </div>
                  <div className="w-16 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${colorSet.from} ${colorSet.to} rounded-full transition-all duration-500`}
                      style={{
                        width: `${Math.min(100, (f.peopleCount / Math.max(1, totalQuantityDistributed)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-xs text-[var(--muted)]">
                    <span>
                      {accountPercentage}% {isArabic ? "من الحسابات" : "of accounts"}
                    </span>
                  </div>
                  <div className="w-16 h-1.5 bg-[var(--surface-2)] rounded-full overflow-hidden">
                    <div
                      className={`h-full bg-gradient-to-r ${colorSet.from} ${colorSet.to} rounded-full transition-all duration-500 opacity-60`}
                      style={{
                        width: `${Math.min(100, parseFloat(accountPercentage))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Card */}
      {fieldCounts.length > 0 && (
        <div className="glass rounded-2xl p-6 lg:p-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
            {isArabic ? "ملخص الإحصائيات" : "Statistics Summary"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {fieldCounts
                  .reduce((sum, f) => sum + f.peopleCount, 0)
                  .toLocaleString()}
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "إجمالي الزوار (أشخاص)" : "Total Visitors (People)"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {fieldCounts
                  .reduce((sum, f) => sum + f.accountCount, 0)
                  .toLocaleString()}
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "إجمالي الزوار (حسابات)" : "Total Visitors (Accounts)"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {fieldCounts.length.toLocaleString()}
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "محطات نشطة" : "Active Stations"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {total > 0
                  ? Math.round(
                      (fieldCounts.reduce((sum, f) => sum + f.accountCount, 0) /
                        (total * fieldCounts.length)) *
                        100
                    )
                  : 0}
                %
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "معدل الإنجاز" : "Completion Rate"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
