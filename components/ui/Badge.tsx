"use client";
import React from "react";

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-1 rounded bg-green-600 text-white">
      {children}
    </span>
  );
}

