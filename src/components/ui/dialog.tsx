"use client";
import * as D from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { Field, FormError, Textarea } from "./form";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[1px]" />
        <D.Content
          className={clsx(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-2xl bg-white shadow-xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold text-slate-900">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-slate-500">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Boîte de dialogue"}</D.Description>}
            </div>
            <D.Close className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fermer">
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          {children && <div className="space-y-4 px-5 py-4">{children}</div>}
          {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:justify-end">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/**
 * Confirmation d'action sensible (PRD §10.6), avec motif facultatif ou obligatoire.
 * L'erreur éventuelle renvoyée par le serveur est affichée dans la boîte.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmer",
  tone = "primary",
  reason,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  reason?: { label: string; required: boolean; placeholder?: string };
  onConfirm: (reason: string) => Promise<unknown>;
  children?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (v: boolean) => {
    if (!v) {
      setText("");
      setError(null);
    }
    onOpenChange(v);
  };
  const submit = async () => {
    if (reason?.required && text.trim().length < 3) {
      setError("Un motif d’au moins 3 caractères est requis.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      close(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>
            Annuler
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {reason && (
        <Field label={reason.label} required={reason.required}>
          {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={reason.placeholder} maxLength={500} />}
        </Field>
      )}
      <FormError message={error} />
    </Dialog>
  );
}
