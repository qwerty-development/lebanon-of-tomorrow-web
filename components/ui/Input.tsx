"use client";
import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded px-3 py-2 bg-[var(--surface-2)] border border-white/10 text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 ${className}`}
      {...props}
    />
  );
}

