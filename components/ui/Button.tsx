"use client";
import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "glass";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  className = "",
  variant = "outline",
  size = "md",
  loading = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = "btn transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium inline-flex items-center justify-center gap-2 relative overflow-hidden";
  
  const variants = {
    primary: "btn-primary",
    outline: "",
    ghost: "bg-transparent border-transparent hover:bg-[var(--surface-glass)] hover:border-[var(--border-glass)]",
    glass: "glass border-[var(--border-glass)] hover:bg-[var(--surface-glass-hover)]",
  } as const;
  
  const sizes = { 
    sm: "text-sm px-3 py-2 h-8", 
    md: "text-sm px-4 py-2.5 h-10", 
    lg: "text-base px-6 py-3 h-12" 
  } as const;

  return (
    <button 
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} 
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-inherit">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <span className={loading ? "opacity-0" : ""}>
        {children}
      </span>
    </button>
  );
}

