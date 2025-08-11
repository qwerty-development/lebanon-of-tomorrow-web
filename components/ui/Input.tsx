"use client";
import React, { forwardRef } from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  variant?: "default" | "glass" | "minimal";
  error?: boolean;
  icon?: React.ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", variant = "default", error = false, icon, ...props }, ref) => {
    const baseClasses = "w-full transition-all font-medium placeholder:font-normal";
    
    const variants = {
      default: "rounded-xl px-4 py-3 bg-[var(--surface)] border border-[var(--border-color)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:ring-4 focus:ring-[var(--brand-accent)]",
      glass: "glass rounded-xl px-4 py-3 border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)]",
      minimal: "bg-transparent border-0 border-b-2 border-[var(--border-color)] rounded-none px-0 py-2 text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)]",
    } as const;

    const errorClasses = error 
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" 
      : "";

    if (icon) {
      return (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none">
            {icon}
          </div>
          <input
            ref={ref}
            className={`${baseClasses} ${variants[variant]} ${errorClasses} pl-10 ${className}`}
            {...props}
          />
        </div>
      );
    }

    return (
      <input
        ref={ref}
        className={`${baseClasses} ${variants[variant]} ${errorClasses} ${className}`}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";

