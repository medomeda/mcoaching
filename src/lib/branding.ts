"use client";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_BRAND_NAME } from "@/modules/core/branding";
import { api } from "./api";

/** Identité de l'espace (nom, mention éventuelle), lue dans l'état public du système. */
export function useBranding() {
  const q = useQuery({ queryKey: ["system-status"], queryFn: () => api.auth.systemStatus(), staleTime: 60_000 });
  return { name: q.data?.brandName || DEFAULT_BRAND_NAME, notice: q.data?.notice ?? null, organization: q.data?.organization ?? null };
}
