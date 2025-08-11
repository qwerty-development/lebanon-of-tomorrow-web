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
  };

  const [total, setTotal] = useState(0);
  const [fieldCounts, setFieldCounts] = useState<{ id: string; name: string; count: number }[]>([]);

  useEffect(() => {
    let channel: any | null = null;
    async function load() {
      const { count: totalCount } = await supabase
        .from("attendees")
        .select("id", { count: "exact", head: true });
      setTotal(totalCount ?? 0);
      const { data: fieldRows } = await supabase
        .from("fields")
        .select("id,name,is_enabled,sort_order")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });
      const counts: { id: string; name: string; count: number }[] = [];
      for (const f of fieldRows ?? []) {
        const { count } = await supabase
          .from("attendee_field_status")
          .select("attendee_id", { count: "exact", head: true })
          .eq("field_id", f.id)
          .not("checked_at", "is", null);
        counts.push({ id: f.id, name: f.name, count: count ?? 0 });
      }
      setFieldCounts(counts);
    }
    async function init() {
      await load();
      channel = supabase
        .channel("stats-realtime")
        .on("postgres_changes", { event: "*", schema: "public", table: "attendees" }, () => load())
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendee_field_status" },
          () => load()
        )
        .on("postgres_changes", { event: "*", schema: "public", table: "fields" }, () => load())
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
          {isArabic ? "إحصائيات شاملة لحضور المشاركين" : "Comprehensive attendance statistics"}
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6">
        {/* Total Attendees Card */}
        <div className="card p-6 hover:shadow-xl transition-all duration-300 border-l-4 border-l-[var(--brand)]">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-sm font-medium text-[var(--muted)] mb-2">{t.total}</div>
              <div className="text-3xl font-bold text-[var(--foreground)]">{total.toLocaleString()}</div>
            </div>
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--brand)] to-[var(--brand-600)] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <div className="flex items-center text-sm text-green-600 dark:text-green-400">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="font-medium">{isArabic ? "إجمالي المسجلين" : "Total registered"}</span>
            </div>
          </div>
        </div>

        {/* Field Statistics Cards */}
        {fieldCounts.map((f, index) => {
          const colors = [
            { from: "from-green-500", to: "to-green-600", border: "border-l-green-500" },
            { from: "from-blue-500", to: "to-blue-600", border: "border-l-blue-500" },
            { from: "from-purple-500", to: "to-purple-600", border: "border-l-purple-500" },
            { from: "from-orange-500", to: "to-orange-600", border: "border-l-orange-500" },
            { from: "from-pink-500", to: "to-pink-600", border: "border-l-pink-500" },
            { from: "from-indigo-500", to: "to-indigo-600", border: "border-l-indigo-500" },
          ];
          const colorSet = colors[index % colors.length];
          const percentage = total > 0 ? ((f.count / total) * 100).toFixed(1) : "0";

          return (
            <div key={f.id} className={`card p-6 hover:shadow-xl transition-all duration-300 border-l-4 ${colorSet.border}`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-sm font-medium text-[var(--muted)] mb-2">{f.name}</div>
                  <div className="text-3xl font-bold text-[var(--foreground)]">{f.count.toLocaleString()}</div>
                </div>
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${colorSet.from} ${colorSet.to} flex items-center justify-center`}>
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center text-sm text-[var(--muted)]">
                  <span>{percentage}% {isArabic ? "من الإجمالي" : "of total"}</span>
                </div>
                <div className="w-16 h-2 bg-[var(--surface-2)] rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${colorSet.from} ${colorSet.to} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.min(100, parseFloat(percentage))}%` }}
                  />
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {fieldCounts.reduce((sum, f) => sum + f.count, 0).toLocaleString()}
              </div>
              <div className="text-sm text-[var(--muted)]">
                {isArabic ? "إجمالي الفحوصات" : "Total Checkpoints"}
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
                {total > 0 ? Math.round((fieldCounts.reduce((sum, f) => sum + f.count, 0) / (total * fieldCounts.length)) * 100) : 0}%
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

