"use client";
import { clsx } from "clsx";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

const control =
  "block rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-500";

export function controlClass(invalid?: boolean, extra?: string) {
  // Une largeur fixe non préfixée (ex. « w-48 ») remplace la pleine largeur ; « sm:w-44 » la conserve sur mobile.
  const hasWidth = /(^|\s)w-/.test(extra ?? "");
  return clsx(control, !hasWidth && "w-full", invalid ? "border-red-400" : "border-slate-300", extra);
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={controlClass(invalid, clsx("h-10", className))} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={controlClass(invalid, clsx("py-2 leading-relaxed", className))} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} className={controlClass(invalid, clsx("h-10 pr-8", className))} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
});

/** Champ avec libellé, aide et message d'erreur reliés pour l'accessibilité. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; invalid: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, invalid: !!error })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 accent-brand-700" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}
