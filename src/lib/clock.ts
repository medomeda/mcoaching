"use client";
import { getRuntime } from "@/server/runtime";

/** Instant applicatif (inclut le décalage de l'horloge de démonstration). */
export function appNow(): number {
  try {
    return getRuntime().store.now().getTime();
  } catch {
    return Date.now();
  }
}
