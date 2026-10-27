/**
 * Outils de DÉMONSTRATION uniquement (désactivés si NEXT_PUBLIC_DEMO_MODE !== "true") :
 * horloge simulée, boîte mail de démonstration, simulation d'échecs e-mail, seed et réinitialisation.
 * Ces opérations ne requièrent pas de session : elles n'existent pas en production.
 */
import { z } from "zod";
import { forbidden } from "@/modules/core/errors";
import { createEmptyDatabase } from "../db/schema";
import { getRuntime } from "../runtime";
import { catchUpJobs, parse, resetJobThrottle, store } from "./context";
import { buildDemoDatabase, DEMO_PASSWORD } from "../seed/demoSeed";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

function assertDemo() {
  if (!isDemoMode()) throw forbidden("Mode démonstration désactivé.");
}

export async function demoState() {
  assertDemo();
  const db = store().snapshot();
  return {
    now: store().now(db).toISOString(),
    real_now: store().realNow().toISOString(),
    clock_offset_ms: db.meta.clock_offset_ms,
    email_failure_rate: db.app_settings.demo_email_failure_rate,
    demo_seeded: db.meta.demo_seeded,
    mailbox_count: db.demo_mailbox.length,
    accounts: db.meta.demo_seeded
      ? db.users
          .filter((u) => u.is_demo)
          .map((u) => ({ email: u.email, full_name: u.full_name, role: u.role, status: u.status }))
      : [],
    demo_password: db.meta.demo_seeded ? DEMO_PASSWORD : null,
  };
}

export async function advanceClock(input: unknown) {
  assertDemo();
  const { minutes } = parse(z.object({ minutes: z.number().int().min(1).max(60 * 24 * 60) }), input);
  await store().transaction((db) => {
    db.meta.clock_offset_ms += minutes * 60_000;
  });
  resetJobThrottle();
  await catchUpJobs(true);
}

export async function resetClock() {
  assertDemo();
  await store().transaction((db) => {
    db.meta.clock_offset_ms = 0;
  });
  resetJobThrottle();
}

export async function setEmailFailureRate(input: unknown) {
  assertDemo();
  const { rate } = parse(z.object({ rate: z.number().min(0).max(1) }), input);
  await store().transaction((db) => {
    db.app_settings.demo_email_failure_rate = rate;
  });
}

export async function runJobs() {
  assertDemo();
  resetJobThrottle();
  await catchUpJobs(true);
}

export async function mailbox() {
  assertDemo();
  const db = store().snapshot();
  return [...db.demo_mailbox].sort((a, b) => b.received_at.localeCompare(a.received_at));
}

export async function resetAllData() {
  assertDemo();
  const rt = getRuntime();
  await rt.files.clear();
  await rt.store.replace(createEmptyDatabase(rt.store.realNow().toISOString()));
  resetJobThrottle();
}

/** Remplace toutes les données par le jeu de démonstration. */
export async function seedDemo() {
  assertDemo();
  const rt = getRuntime();
  const { db, files } = await buildDemoDatabase(rt.store.realNow().getTime());
  await rt.files.clear();
  for (const [key, f] of files) await rt.files.put(key, f);
  await rt.store.replace(db);
  resetJobThrottle();
}
