"use client";
import { Download, FileText, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { downloadAttachment } from "@/lib/api";
import { fmtBytes } from "@/lib/format";

export interface AttachmentView {
  id: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}

export function AttachmentChips({ items, tone = "light", onRemove }: { items: AttachmentView[]; tone?: "light" | "dark"; onRemove?: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;
  const dl = async (id: string) => {
    setBusy(id);
    try {
      await downloadAttachment(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((a) => (
        <li key={a.id} className={`flex max-w-full items-center gap-1 rounded-lg border text-xs ${tone === "dark" ? "border-white/25 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-700"}`}>
          <button onClick={() => void dl(a.id)} className="flex min-w-0 items-center gap-1.5 px-2 py-1.5 hover:underline" disabled={busy === a.id} title="Télécharger">
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{a.filename}</span>
            <span className="shrink-0 opacity-70">({fmtBytes(a.size_bytes)})</span>
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
          {onRemove && (
            <button onClick={() => onRemove(a.id)} className="px-1.5 py-1.5 text-slate-400 hover:text-red-600" aria-label={`Retirer ${a.filename}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Sélecteur de fichiers avec pré-contrôle (le contrôle qui fait foi est réalisé par l'API). */
export function FilePicker({
  files,
  onChange,
  maxFiles,
  maxSizeBytes,
  allowed,
  existing = 0,
}: {
  files: File[];
  onChange: (f: File[]) => void;
  maxFiles: number;
  maxSizeBytes: number;
  allowed: string[];
  existing?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!allowed.includes(ext)) {
        toast.error(`« ${f.name} » : format non autorisé (${allowed.join(", ")}).`);
        continue;
      }
      if (f.size > maxSizeBytes) {
        toast.error(`« ${f.name} » dépasse ${fmtBytes(maxSizeBytes)}.`);
        continue;
      }
      if (next.length + existing >= maxFiles) {
        toast.error(`${maxFiles} fichiers maximum.`);
        break;
      }
      next.push(f);
    }
    onChange(next);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="space-y-2">
      <input ref={ref} type="file" multiple className="sr-only" accept={allowed.map((e) => `.${e}`).join(",")} onChange={(e) => add(e.target.files)} aria-label="Joindre des fichiers" />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-lg border border-brand-200 bg-brand-50 py-1 pl-2 pr-1 text-xs text-brand-900">
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              <span className="max-w-[12rem] truncate">{f.name}</span>
              <span className="opacity-60">({fmtBytes(f.size)})</span>
              <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-0.5 hover:bg-brand-100" aria-label={`Retirer ${f.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={() => ref.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:underline">
        <Paperclip className="h-3.5 w-3.5" /> Joindre un fichier
      </button>
      <p className="text-[11px] text-slate-400">
        Formats : {allowed.join(", ")} · {fmtBytes(maxSizeBytes)} max · {maxFiles} fichiers max
      </p>
    </div>
  );
}
