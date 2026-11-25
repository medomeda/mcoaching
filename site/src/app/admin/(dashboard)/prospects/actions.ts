"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { PROSPECT_STATUSES } from "@/db/schema";
import { guard } from "@/server/guard";
import { setProspectStatus } from "@/server/prospects";

export async function setStatusAction(formData: FormData) {
  await guard();
  const status = String(formData.get("status"));
  if (!(PROSPECT_STATUSES as readonly string[]).includes(status)) throw new Error("Statut invalide.");
  await setProspectStatus(String(formData.get("id")), status as (typeof PROSPECT_STATUSES)[number], db);
  redirect("/admin/prospects");
}
