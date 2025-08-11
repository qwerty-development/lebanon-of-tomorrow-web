"use client";
import React from "react";

type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "primary" | "success" | "warning" | "error" | "glass";
  size?: "sm" | "md" | "lg";
};

export function Badge({ 
  className = "", 
  variant = "default", 
  size = "md",
  children,
  ...props 
}: BadgeProps) {
  const baseClasses = "inline-flex items-center justify-center font-medium rounded-full transition-all";
  
  const variants = {
    default: "bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border-color)]",
    primary: "bg-[var(--brand)] text-white border border-[var(--brand)]",
    success: "bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800",
    warning: "bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800",
    error: "bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800",
    glass: "glass border-[var(--border-glass)] text-[var(--foreground)]",
  } as const;
  
  const sizes = {
    sm: "px-2 py-1 text-xs",
    md: "px-2.5 py-1.5 text-sm",
    lg: "px-3 py-2 text-base",
  } as const;

  return (
    <div 
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

