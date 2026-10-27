"use client";
import { clsx } from "clsx";
import { HelpCircle, Info, Send, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MessageIntent } from "@/modules/core/types";
import type { RequestDetail } from "@/server/api/requests";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { api, readFiles } from "@/lib/api";
import { useAction } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { AttachmentChips, FilePicker } from "./attachments";

const INTENT_LABEL: Partial<Record<MessageIntent, string>> = {
  CLARIFICATION_REQUEST: "Demande de précisions",
  FINAL_RESPONSE: "Réponse finale",
};

export function MessageThread({ detail, viewerId }: { detail: RequestDetail; viewerId: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  const count = detail.messages.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count]);

  let lastCycle = 0;
  return (
    <ol className="space-y-3" aria-label="Fil de discussion">
      {detail.messages.map((m) => {
        const separator = m.cycle_number !== lastCycle && lastCycle !== 0;
        lastCycle = m.cycle_number;
        const mine = m.sender?.id === viewerId;
        return (
          <li key={m.id}>
            {separator && (
              <div className="my-4 flex items-center gap-3 text-xs font-medium text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> Cycle {m.cycle_number} <span className="h-px flex-1 bg-slate-200" />
              </div>
            )}
            {m.kind === "SYSTEM" ? (
              <div className="mx-auto flex max-w-xl items-start gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <div>
                  <span className="font-medium">Message automatique · </span>
                  {m.body}
                  <span className="mt-0.5 block text-slate-400">{fmtDateTime(m.created_at)}</span>
                </div>
              </div>
            ) : (
              <div className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-xs sm:max-w-[78%]", mine ? "rounded-br-md bg-brand-700 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800")}>
                  <div className={clsx("mb-1 flex flex-wrap items-center gap-x-2 text-xs", mine ? "text-brand-100" : "text-slate-500")}>
                    <span className="font-semibold">{mine ? "Vous" : (m.sender?.full_name ?? "—")}</span>
                    {!mine && m.sender && <span>· {ROLE_LABELS[m.sender.role]}</span>}
                    {INTENT_LABEL[m.intent] && (
                      <span className={clsx("rounded-full px-1.5 py-px font-medium", mine ? "bg-white/15" : m.intent === "FINAL_RESPONSE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
                        {INTENT_LABEL[m.intent]}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.body}</p>
                  {m.attachments.length > 0 && (
                    <div className="mt-2">
                      <AttachmentChips items={m.attachments} tone={mine ? "dark" : "light"} />
                    </div>
                  )}
                  <p className={clsx("mt-1 text-right text-[11px]", mine ? "text-brand-200" : "text-slate-400")}>{fmtDateTime(m.created_at)}</p>
                </div>
              </div>
            )}
          </li>
        );
      })}
      <div ref={endRef} />
    </ol>
  );
}

export function Composer({ detail, role }: { detail: RequestDetail; role: "COACH" | "LEARNER" }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const actions = detail.allowed_actions;
  const intents: Array<{ value: MessageIntent; label: string; icon: React.ReactNode; enabled: boolean }> =
    role === "COACH"
      ? [
          { value: "MESSAGE", label: "Répondre", icon: <Send className="h-3.5 w-3.5" />, enabled: actions.includes("MESSAGE") },
          { value: "CLARIFICATION_REQUEST", label: "Demander des précisions", icon: <HelpCircle className="h-3.5 w-3.5" />, enabled: actions.includes("CLARIFY") },
          { value: "FINAL_RESPONSE", label: "Réponse finale", icon: <CheckCheck className="h-3.5 w-3.5" />, enabled: actions.includes("FINAL_RESPONSE") },
        ]
      : [{ value: "MESSAGE", label: "Répondre", icon: <Send className="h-3.5 w-3.5" />, enabled: actions.includes("MESSAGE") }];
  const available = intents.filter((i) => i.enabled);
  const [intent, setIntent] = useState<MessageIntent>(available[0]?.value ?? "MESSAGE");
  useEffect(() => {
    if (!available.some((i) => i.value === intent) && available[0]) setIntent(available[0].value);
  }, [available, intent]);

  const send = useAction(
    async () => api.requests.sendMessage(detail.id, { body, intent }, files.length ? await readFiles(files) : undefined),
    {
      success: intent === "FINAL_RESPONSE" ? "Réponse finale envoyée." : intent === "CLARIFICATION_REQUEST" ? "Demande de précisions envoyée." : "Message envoyé.",
      onSuccess: () => {
        setBody("");
        setFiles([]);
      },
    },
  );
  if (available.length === 0) return null;
  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) void send.run();
  };
  return (
    <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-3 pt-3 backdrop-blur sm:-mx-5 sm:px-5">
      {available.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type de réponse">
          {available.map((i) => (
            <button
              key={i.value}
              role="radio"
              aria-checked={intent === i.value}
              onClick={() => setIntent(i.value)}
              className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", intent === i.value ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}
            >
              {i.icon}
              {i.label}
            </button>
          ))}
        </div>
      )}
      {intent === "FINAL_RESPONSE" && <p className="mb-2 text-xs text-emerald-700">La demande passera au statut « Réponse apportée », en attente de clôture.</p>}
      {intent === "CLARIFICATION_REQUEST" && <p className="mb-2 text-xs text-amber-700">La demande passera « En attente de l’apprenant » jusqu’à sa réponse.</p>}
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={onKey}
        placeholder={role === "COACH" ? "Rédigez votre réponse…" : "Écrivez votre message…"}
        aria-label="Message"
        maxLength={5000}
        invalid={!!send.fieldErrors.body}
      />
      {send.fieldErrors.body && <p className="mt-1 text-xs text-red-600">{send.fieldErrors.body}</p>}
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <FilePicker files={files} onChange={setFiles} maxFiles={detail.settings.max_files} maxSizeBytes={detail.settings.max_size_bytes} allowed={detail.settings.allowed_extensions} />
        <Button onClick={() => void send.run()} loading={send.pending} disabled={!body.trim()} icon={<Send className="h-4 w-4" />}>
          Envoyer
        </Button>
      </div>
    </div>
  );
}
