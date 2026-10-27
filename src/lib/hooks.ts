"use client";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "./api";

export function useApi<T>(key: readonly unknown[], fn: () => Promise<T>, opts?: Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">) {
  return useQuery<T, ApiError>({ queryKey: key, queryFn: fn, ...opts });
}

/**
 * Exécute une action et affiche le résultat (succès / échec d'enregistrement, PRD §10.6).
 * Les erreurs de validation sont renvoyées pour affichage au niveau des champs.
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { success?: string | ((r: R) => string); onSuccess?: (r: R) => void; silentError?: boolean } = {},
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn(...args);
        if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
        opts.onSuccess?.(r);
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("INTERNAL", (e as Error).message, 500);
        setError(err);
        if (!opts.silentError) toast.error(err.message);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn],
  );
  return { run, pending, error, fieldErrors: error?.fieldErrors ?? {}, reset: () => setError(null) };
}
