"use client";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 shadow-sm disabled:bg-brand-300",
  secondary: "bg-brand-50 text-brand-800 hover:bg-brand-100 disabled:text-brand-300",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm disabled:bg-red-300",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
  icon: "h-9 w-9 justify-center",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({ href, variant = "primary", size = "md", icon, className, children }: { href: string; variant?: Variant; size?: Size; icon?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}
