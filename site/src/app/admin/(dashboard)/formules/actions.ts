"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { guard } from "@/server/guard";
import { defaultDeps, planFromForm, reorderPlans, savePlan, setPublished } from "@/server/plans-admin";

export async function savePlanAction(formData: FormData) {
  await guard();
  try {
    await savePlan(planFromForm(formData), defaultDeps(db));
  } catch (e) {
    redirect(`/admin/formules?erreur=${encodeURIComponent(e instanceof Error ? "Données invalides : vérifiez les champs." : "Erreur")}`);
  }
  redirect("/admin/formules");
}

export async function setPublishedAction(formData: FormData) {
  await guard();
  await setPublished(String(formData.get("id")), formData.get("published") === "true", defaultDeps(db));
  redirect("/admin/formules");
}

export async function moveAction(formData: FormData) {
  await guard();
  const ids = String(formData.get("order")).split(",").filter(Boolean);
  await reorderPlans(ids, defaultDeps(db));
  redirect("/admin/formules");
}
