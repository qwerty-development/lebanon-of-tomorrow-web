"use client";
import { supabase } from "./supabaseClient";

// Supabase caps a single select at 1000 rows, so every full-table read pages.
const CHUNK = 1000;

export async function fetchAllRows<T = any>(
  table: string,
  columns: string,
  orderBy: string[]
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += CHUNK) {
    let q = supabase.from(table).select(columns);
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + CHUNK - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return all;
}

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvBlob(headers: string[], rows: unknown[][]): Blob {
  const body = [
    headers.join(","),
    ...rows.map((r) => r.map(escapeCell).join(",")),
  ].join("\r\n");
  // Leading BOM so Excel reads the Arabic columns as UTF-8.
  return new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" });
}

export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportCounts = { attendees: number; statuses: number };

// Downloads two files: the attendee roster and the full check-in history.
export async function exportEverything(prefix: string): Promise<ExportCounts> {
  const attendees = await fetchAllRows<any>(
    "attendees",
    "id,name,record_number,governorate,district,area,phone,quantity,age",
    ["id"]
  );
  const fields = await fetchAllRows<any>("fields", "id,name", ["id"]);
  const statuses = await fetchAllRows<any>(
    "attendee_field_status",
    "attendee_id,field_id,checked_at,quantity",
    ["attendee_id", "field_id"]
  );

  const fieldName = new Map(fields.map((f) => [f.id, f.name]));
  const attendeeById = new Map(attendees.map((a) => [a.id, a]));

  await downloadBlob(
    toCsvBlob(
      ["id", "name", "record_number", "governorate", "district", "area", "phone", "quantity", "age"],
      attendees.map((r) => [
        r.id, r.name, r.record_number, r.governorate, r.district, r.area,
        r.phone, r.quantity, r.age,
      ])
    ),
    `${prefix}-attendees.csv`
  );

  await downloadBlob(
    toCsvBlob(
      ["attendee_id", "record_number", "attendee_name", "field_id", "field_name", "checked_at", "quantity"],
      statuses.map((s) => {
        const a = attendeeById.get(s.attendee_id);
        return [
          s.attendee_id, a?.record_number ?? "", a?.name ?? "",
          s.field_id, fieldName.get(s.field_id) ?? "",
          s.checked_at, s.quantity,
        ];
      })
    ),
    `${prefix}-field-status.csv`
  );

  return { attendees: attendees.length, statuses: statuses.length };
}
