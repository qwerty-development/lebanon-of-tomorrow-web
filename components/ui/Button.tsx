"use client";
import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline";
  size?: "sm" | "md";
};

export function Button({
  className = "",
  variant = "outline",
  size = "md",
  ...props
}: ButtonProps) {
  const base = "btn transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "btn-primary",
    outline: "",
  } as const;
  const sizes = { sm: "text-sm", md: "" } as const;
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
  );
}

