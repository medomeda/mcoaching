"use client";
import { clsx } from "clsx";
import { ArrowLeft, Check, Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { RequestDetail } from "@/server/api/requests";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardBody, ErrorState, Loading } from "@/components/ui/display";
import { Field, FormError, Input, Textarea } from "@/components/ui/form";
import { api, ApiError, readFiles } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/format";
import { AttachmentChips, FilePicker } from "./attachments";

/**
 * Création / modification d'un brouillon puis soumission (PRD §6.2).
 * La soumission utilise une clé d'idempotence générée une fois par formulaire (REC-20).
 */
export function RequestForm({ draft }: { draft?: RequestDetail }) {
  const router = useRouter();
  const categories = useApi(["categories"], () => api.settings.listCategories());
  const eligibility = useApi(["eligibility"], () => api.requests.myEligibility());
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [categoryId, setCategoryId] = useState(draft?.category_id ?? "");
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const idempotencyKey = useRef(`submit-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const draftId = useRef<string | null>(draft?.id ?? null);

  if (categories.isLoading || eligibility.isLoading) return <Loading />;
  if (categories.error) return <ErrorState error={categories.error} />;
  const elig = eligibility.data;
  const existing = (draft?.attachments ?? []).filter((a) => !removed.includes(a.id));
  const settings = draft?.settings ?? elig!.attachment_settings;
  const category = categories.data?.find((c) => c.id === categoryId);

  const validateLocal = () => {
    const e: Record<string, string> = {};
    if (!categoryId) e.category_id = "Sélectionnez une catégorie.";
    if (subject.trim().length < 5) e.subject = "Le sujet : 5 caractères minimum.";
    if (description.trim().length < 20) e.description = "La description : 20 caractères minimum.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Enregistre le brouillon (création ou mise à jour) et renvoie son identifiant. */
  const persist = async () => {
    const uploads = files.length ? await readFiles(files) : undefined;
    const payload = { category_id: categoryId, subject, description };
    if (draftId.current) {
      await api.requests.updateDraft(draftId.current, { ...payload, removeAttachmentIds: removed }, uploads);
    } else {
      draftId.current = (await api.requests.createDraft(payload, uploads)).id;
    }
    setFiles([]);
    return draftId.current!;
  };

  const handle = async (mode: "save" | "submit") => {
    setError(null);
    if (!validateLocal()) {
      setStep("edit");
      return;
    }
    setBusy(mode);
    try {
      const id = await persist();
      if (mode === "save") {
        toast.success("Brouillon enregistré. Il ne consomme aucun quota.");
        router.push(`/learner/requests/${id}`);
        return;
      }
      const r = await api.requests.submitRequest(id, { idempotencyKey: idempotencyKey.current });
      toast.success(`Demande ${r.reference} soumise. Échéance de première réponse : ${fmtDateTime(r.due_at)}.`);
      router.push(`/learner/requests/${id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors ?? {});
        setError(draftId.current && mode === "submit" ? `${e.message} Votre brouillon a été conservé.` : e.message);
        if (e.fieldErrors && Object.keys(e.fieldErrors).length) setStep("edit");
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {elig && !elig.ok && (
        <Alert tone="warning" title="Vous ne pouvez pas soumettre de demande pour le moment">
          <ul className="list-inside list-disc">
            {elig.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="mt-1">Vous pouvez néanmoins préparer un brouillon.</p>
        </Alert>
      )}
      {elig?.ok && elig.balance.enabled && (
        <Alert tone="info">
          Cette demande consommera 1 unité de votre quota à la soumission (il vous en reste {elig.balance.remaining}). Un brouillon n’en consomme aucune.
        </Alert>
      )}

      <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Étapes">
        {[
          ["edit", "1. Votre question"],
          ["review", "2. Récapitulatif"],
        ].map(([k, l]) => (
          <li key={k} className={clsx("rounded-full px-3 py-1", step === k ? "bg-brand-700 text-white" : "bg-slate-200 text-slate-600")}>
            {l}
          </li>
        ))}
      </ol>

      {step === "edit" ? (
        <Card>
          <CardBody className="space-y-5">
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">
                Catégorie <span className="text-red-600">*</span>
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {categories.data?.map((c) => (
                  <label key={c.id} className={clsx("flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition", categoryId === c.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-slate-300")}>
                    <input type="radio" name="category" value={c.id} checked={categoryId === c.id} onChange={() => setCategoryId(c.id)} className="mt-0.5 accent-brand-700" />
                    <span>
                      <span className="block font-medium text-slate-900">{c.name}</span>
                      {c.description && <span className="block text-xs text-slate-500">{c.description}</span>}
                    </span>
                  </label>
                ))}
              </div>
              {errors.category_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.category_id}</p>}
            </fieldset>
            <Field label="Sujet" required error={errors.subject} hint="Résumez votre question en une phrase.">
              {(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} />}
            </Field>
            <Field label="Description" required error={errors.description} hint={`${description.length}/5000 — décrivez votre situation, ce que vous avez déjà compris et ce qui vous bloque.`}>
              {(p) => <Textarea {...p} rows={8} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />}
            </Field>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Pièces jointes (facultatif)</p>
              {existing.length > 0 && <AttachmentChips items={existing} onRemove={(id) => setRemoved((r) => [...r, id])} />}
              <FilePicker files={files} onChange={setFiles} maxFiles={settings.max_files} maxSizeBytes={settings.max_size_bytes} allowed={settings.allowed_extensions} existing={existing.length} />
            </div>
            <FormError message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={busy === "save"} onClick={() => void handle("save")}>
                Enregistrer le brouillon
              </Button>
              <Button onClick={() => validateLocal() && setStep("review")}>Vérifier le récapitulatif</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Récapitulatif</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Catégorie</dt>
                <dd className="font-medium text-slate-900">{category?.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Sujet</dt>
                <dd className="font-medium text-slate-900">{subject}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Description</dt>
                <dd className="whitespace-pre-wrap text-slate-700">{description}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Pièces jointes</dt>
                <dd className="text-slate-700">{existing.length + files.length === 0 ? "Aucune" : [...existing.map((a) => a.filename), ...files.map((f) => f.name)].join(", ")}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Coach destinataire</dt>
                <dd className="text-slate-700">{elig?.coach?.full_name ?? "Aucun coach affecté"}</dd>
              </div>
            </dl>
            <Alert tone="neutral">Les échanges sont pédagogiques : ils ne constituent pas une recommandation d’investissement personnalisée. Les administrateurs autorisés peuvent consulter les demandes à des fins de supervision.</Alert>
            <FormError message={error} />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setStep("edit")}>
                Modifier
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={busy === "save"} disabled={busy === "submit"} onClick={() => void handle("save")}>
                  Enregistrer le brouillon
                </Button>
                <Button icon={busy ? undefined : elig?.ok ? <Send className="h-4 w-4" /> : <Check className="h-4 w-4" />} loading={busy === "submit"} disabled={!elig?.ok || busy === "save"} onClick={() => void handle("submit")}>
                  Soumettre la demande
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
