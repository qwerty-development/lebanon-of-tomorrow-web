"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function StatsPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  const t = {
    title: isArabic ? "الإحصائيات" : "Statistics",
    total: isArabic ? "إجمالي المشاركين" : "Total Attendees",
    totalPeople: isArabic ? "إجمالي الأشخاص" : "Total People",
    totalItems: isArabic ? "إجمالي العناصر الموزعة" : "Total Items Distributed",
    mainEntranceItems: isArabic
      ? "إجمالي العناصر - المدخل الرئيسي"
      : "Main Entrance Items Total",
    averageFamily: isArabic ? "متوسط حجم الأسرة" : "Average Family Size",
    topStation: isArabic ? "أعلى محطة زيارة" : "Most Visited Station",
    completionRate: isArabic ? "معدل الإنجاز الإجمالي" : "Overall Completion Rate",
    totalRegistered: isArabic ? "إجمالي المسجلين" : "Total Registered",
  };

  const [total, setTotal] = useState(0);
  const [totalPeopleRegistered, setTotalPeopleRegistered] = useState(0);
  const [fieldCounts, setFieldCounts] = useState<
    { id: string; name: string; accountCount: number; peopleCount: number; isMain: boolean }[]
  >([]);
  const [mainEntranceQuantity, setMainEntranceQuantity] = useState(0);
  const [totalQuantityDistributed, setTotalQuantityDistributed] = useState(0);
  const [averageFamilySize, setAverageFamilySize] = useState(0);
  const [topStation, setTopStation] = useState<{ name: string; count: number } | null>(null);
  const [overallCompletionRate, setOverallCompletionRate] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    let channel: any | null = null;
    async function load() {
      // Get total families count
      const { count: totalCount } = await supabase
        .from("attendees")
        .select("id", { count: "exact", head: true });
      setTotal(totalCount ?? 0);

      // Get total people registered (sum of all attendee quantities)
      const { data: attendeesData } = await supabase
        .from("attendees")
        .select("quantity");
      const totalPeopleReg = attendeesData?.reduce((sum, attendee) => sum + attendee.quantity, 0) ?? 0;
      setTotalPeopleRegistered(totalPeopleReg);

      // Calculate average family size
      const totalCountSafe = totalCount ?? 0;
      const avgFamilySize = totalCountSafe > 0 ? totalPeopleReg / totalCountSafe : 0;
      setAverageFamilySize(avgFamilySize);

      const { data: fieldRows } = await supabase
        .from("fields")
        .select("id,name,is_enabled,sort_order,is_main")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      const fieldsData = fieldRows ?? [];
      const counts: { id: string; name: string; accountCount: number; peopleCount: number; isMain: boolean }[] = [];
      let mainEntranceQty = 0;
      let totalQtyDistributed = 0;
      let maxStationCount = 0;
      let topStationName = "";

      for (const f of fieldsData) {
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

        // Track top station by people count (exclude main entrance)
        if (!f.is_main && peopleCount > maxStationCount) {
          maxStationCount = peopleCount;
          topStationName = f.name;
        }

        counts.push({ 
          id: f.id, 
          name: f.name, 
          accountCount: accountCount ?? 0, 
          peopleCount,
          isMain: f.is_main ?? false
        });
      }

      // Calculate overall completion rate
      const totalPossibleVisits = totalCountSafe * fieldsData.length;
      const totalActualVisits = counts.reduce((sum, f) => sum + f.accountCount, 0);
      const completionRate = totalPossibleVisits > 0 ? (totalActualVisits / totalPossibleVisits) * 100 : 0;

      setFieldCounts(counts);
      setMainEntranceQuantity(mainEntranceQty);
      setTotalQuantityDistributed(totalQtyDistributed);
      setTopStation({ name: topStationName, count: maxStationCount });
      setOverallCompletionRate(completionRate);
      setLastUpdated(new Date());
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
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
              {t.title}
            </h1>
            <p className="text-[var(--muted)] text-responsive">
              {isArabic
                ? "إحصائيات شاملة لحضور المشاركين"
                : "Comprehensive attendance statistics"}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {isArabic ? "آخر تحديث: " : "Last updated: "}
              {lastUpdated.toLocaleString(isArabic ? "ar" : "en", {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6">
        {/* Total Attendees Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-[var(--brand)]">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.totalRegistered}
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="flex items-center text-sm text-blue-600 dark:text-blue-400">
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="font-medium">
                {isArabic ? "الحسابات المسجلة" : "Registered accounts"}
              </span>
            </div>
          </div>
        </div>

        {/* Total People Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.totalPeople}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {totalPeopleRegistered.toLocaleString()}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
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
            <div className="flex items-center text-sm text-emerald-600 dark:text-emerald-400">
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
                {isArabic ? "إجمالي الأفراد" : "Total individuals"}
              </span>
            </div>
          </div>
        </div>

        {/* Average Family Size Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-cyan-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.averageFamily}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {averageFamilySize.toFixed(1)}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center">
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
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="flex items-center text-sm text-cyan-600 dark:text-cyan-400">
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span className="font-medium">
                {isArabic ? "أشخاص لكل حساب" : "People per account"}
              </span>
            </div>
          </div>
        </div>

        {/* Overall Completion Rate Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-rose-500">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">
                {t.completionRate}
              </div>
              <div className="text-3xl font-bold text-[var(--foreground)]">
                {overallCompletionRate.toFixed(1)}%
              </div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center">
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
            <div className="flex items-center text-sm text-rose-600 dark:text-rose-400">
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
                {isArabic ? "معدل اكتمال الزيارات" : "Visit completion rate"}
              </span>
            </div>
          </div>
        </div>

        {/* Top Station Card */}
        {topStation && (
          <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-yellow-500">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="text-sm font-medium text-[var(--muted)] mb-2">
                  {t.topStation}
                </div>
                <div className="text-lg font-bold text-[var(--foreground)] mb-1 leading-tight">
                  {topStation.name}
                </div>
                <div className="text-2xl font-bold text-yellow-600">
                  {topStation.count.toLocaleString()}
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-600 flex items-center justify-center">
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
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <div className="flex items-center text-sm text-yellow-600 dark:text-yellow-400">
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
                  {isArabic ? "الأكثر شعبية" : "Most popular"}
                </span>
              </div>
            </div>
          </div>
        )}

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

      {/* Enhanced Summary Card */}
      {fieldCounts.length > 0 && (
        <div className="glass rounded-2xl p-6 lg:p-8">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-6 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
            {isArabic ? "ملخص الإحصائيات التفصيلي" : "Detailed Statistics Summary"}
          </h2>
          
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
                {mainEntranceQuantity > 0 && totalPeopleRegistered > 0 ? 
                  ((mainEntranceQuantity / totalPeopleRegistered) * 100).toFixed(1) : "0"}%
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "معدل الحضور الفعلي" : "Actual Attendance Rate"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {overallCompletionRate.toFixed(1)}%
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "معدل اكتمال الرحلة" : "Journey Completion Rate"}
              </div>
            </div>
          </div>

          {/* Station Performance Chart */}
          <div className="mt-8">
            <h3 className="text-md font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--brand)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              {isArabic ? "أداء المحطات" : "Station Performance"}
            </h3>
            <div className="space-y-3">
              {fieldCounts
                .filter(station => !station.isMain) // Exclude main entrance
                .sort((a, b) => b.peopleCount - a.peopleCount)
                .map((station, index) => {
                  const maxCount = Math.max(...fieldCounts.filter(f => !f.isMain).map(f => f.peopleCount));
                  const percentage = maxCount > 0 ? (station.peopleCount / maxCount) * 100 : 0;
                  const colors = [
                    'bg-gradient-to-r from-amber-400 to-amber-500',
                    'bg-gradient-to-r from-emerald-400 to-emerald-500', 
                    'bg-gradient-to-r from-blue-400 to-blue-500',
                    'bg-gradient-to-r from-purple-400 to-purple-500',
                    'bg-gradient-to-r from-pink-400 to-pink-500',
                    'bg-gradient-to-r from-indigo-400 to-indigo-500',
                    'bg-gradient-to-r from-cyan-400 to-cyan-500',
                  ];
                  const colorClass = colors[index % colors.length];

                  return (
                    <div key={station.id} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`w-3 h-3 rounded-full ${colorClass.replace('bg-gradient-to-r', 'bg')}`} />
                        <span className="text-sm font-medium text-[var(--foreground)] truncate">
                          {station.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <div className="flex-1 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colorClass} transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold text-[var(--foreground)] min-w-[60px] text-right">
                          {station.peopleCount.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
