"use client";
import { clsx } from "clsx";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Lock, RefreshCw, SearchX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/labels";
import { Button } from "./button";

export function Card({ className, children, as: As = "div" }: { className?: string; children: ReactNode; as?: "div" | "section" | "article" }) {
  return <As className={clsx("rounded-xl border border-slate-200 bg-white shadow-xs", className)}>{children}</As>;
}

export function CardHeader({ title, description, actions, icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-brand-600">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("px-4 py-4 sm:px-5", className)}>{children}</div>;
}

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ tone = "neutral", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 space-y-2">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-700">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Loading({ label = "Chargement…", className }: { label?: string; className?: string }) {
  return (
    <div role="status" className={clsx("flex items-center justify-center gap-2 py-10 text-sm text-slate-500", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export function EmptyState({ title, description, action, icon, filtered }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; filtered?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-400">{icon ?? (filtered ? <SearchX className="h-6 w-6" /> : <Inbox className="h-6 w-6" />)}</div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const code = (error as { code?: string })?.code;
  if (code === "FORBIDDEN") return <ForbiddenState message={(error as Error).message} />;
  if (code === "NOT_FOUND") return <EmptyState title="Introuvable" description={(error as Error).message} icon={<SearchX className="h-6 w-6" />} />;
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <div className="mb-3 rounded-full bg-red-50 p-3 text-red-500">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium text-slate-800">Le chargement a échoué</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{(error as Error)?.message ?? "Erreur inconnue."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState({ message }: { message?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 rounded-full bg-amber-50 p-3 text-amber-600">
        <Lock className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-800">Accès refusé</p>
      <p className="mt-1 max-w-md text-sm text-slate-500">{message ?? "Vous n’avez pas les droits nécessaires pour consulter cette page."}</p>
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (total === 0) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 sm:px-5">
      <span>
        {total} résultat{total > 1 ? "s" : ""} · page {page}/{pages}
      </span>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente" icon={<ChevronLeft className="h-4 w-4" />} />
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante" icon={<ChevronRight className="h-4 w-4" />} />
      </div>
    </nav>
  );
}

export function StatCard({ label, value, hint, tone = "neutral", href, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string; icon?: ReactNode }) {
  const accent = { neutral: "text-slate-900", brand: "text-brand-800", info: "text-sky-800", success: "text-emerald-700", warning: "text-amber-700", danger: "text-red-700" }[tone];
  const body = (
    <div className="flex h-full flex-col justify-between gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className={clsx("text-2xl font-semibold tabular-nums", accent)}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block rounded-xl border border-slate-200 bg-white shadow-xs transition hover:border-brand-300 hover:shadow-sm">
        {body}
      </Link>
    );
  }
  return <Card>{body}</Card>;
}

export function DescriptionList({ items, className }: { items: Array<[ReactNode, ReactNode]>; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-slate-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode; count?: number }> }) {
  return (
    <div role="tablist" className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={clsx(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            value === it.value ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {it.label}
          {it.count !== undefined && (
            <span className={clsx("rounded-full px-1.5 text-xs tabular-nums", value === it.value ? "bg-white/20" : "bg-slate-200 text-slate-600")}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const init = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden className={clsx("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800", className)}>
      {init}
    </span>
  );
}

export function Alert({ tone = "info", title, children, icon, action }: { tone?: Tone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  const styles = { neutral: "border-slate-200 bg-slate-50 text-slate-700", brand: "border-brand-200 bg-brand-50 text-brand-900", info: "border-sky-200 bg-sky-50 text-sky-900", success: "border-emerald-200 bg-emerald-50 text-emerald-900", warning: "border-amber-200 bg-amber-50 text-amber-900", danger: "border-red-200 bg-red-50 text-red-800" }[tone];
  return (
    <div className={clsx("flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm", styles)} role={tone === "danger" || tone === "warning" ? "alert" : "status"}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
