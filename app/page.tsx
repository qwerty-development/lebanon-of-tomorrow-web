"use client";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-2xl font-semibold">Lebanon of Tomorrow</h1>
        <p className="text-sm">Attendance & Distribution Management</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/en/login"
            className="px-4 py-2 rounded border border-black/10 hover:bg-black/5"
          >
            English
          </Link>
          <Link
            href="/ar/login"
            className="px-4 py-2 rounded border border-black/10 hover:bg-black/5"
          >
            العربية
          </Link>
        </div>
      </div>
    </div>
  );
}
