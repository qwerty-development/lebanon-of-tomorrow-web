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
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t.title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded border p-3">
          <div className="text-sm text-black/60">{t.total}</div>
          <div className="text-2xl font-semibold">{total}</div>
        </div>
        {fieldCounts.map((f) => (
          <div key={f.id} className="rounded border p-3">
            <div className="text-sm text-black/60">{f.name}</div>
            <div className="text-2xl font-semibold">{f.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

