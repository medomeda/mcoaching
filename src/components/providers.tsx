"use client";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import type { PublicUser } from "@/server/api/auth";
import { getRuntime } from "@/server/runtime";
import { api, ApiError, DEMO_MODE, hasSession, onServerMutation, onSessionLost } from "@/lib/api";

interface SessionValue {
  user: PublicUser | null;
  status: "loading" | "authenticated" | "anonymous";
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: PublicUser | null) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("SessionProvider manquant.");
  return v;
}

export function homeFor(role: PublicUser["role"]) {
  return role === "ADMIN" ? "/admin" : role === "COACH" ? "/coach" : "/learner";
}

/** Démo : invalide le cache dès que le stockage simulé change (cet onglet ou un autre). */
function StoreSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = getRuntime().store.subscribe(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries(), 60);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);
  return null;
}

/** Serveur : invalide le cache dès qu'une action d'écriture aboutit, pour que les listes se mettent à jour seules. */
function ServerSync() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onServerMutation(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void qc.invalidateQueries(), 60);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [qc]);
  return null;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<SessionValue["status"]>("loading");

  const refresh = useCallback(async () => {
    if (!(await hasSession())) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    try {
      setUser(await api.auth.me());
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = onSessionLost((code) => {
        setUser(null);
        setStatus("anonymous");
        qc.clear();
        if (!["/login", "/setup", "/activate", "/reset-password", "/forgot-password"].includes(window.location.pathname)) {
          const next = encodeURIComponent(window.location.pathname);
          router.replace(`/login?${code === "SESSION_EXPIRED" ? "expired=1&" : ""}next=${next}`);
        }
    });
    return () => {
      unsubscribe();
    };
  }, [router, qc]);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
    setStatus("anonymous");
    qc.clear();
    router.replace("/login");
  }, [router, qc]);

  const value = useMemo<SessionValue>(
    () => ({
      user,
      status,
      refresh,
      logout,
      setUser: (u) => {
        setUser(u);
        setStatus(u ? "authenticated" : "anonymous");
      },
    }),
    [user, status, refresh, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 1,
            refetchOnWindowFocus: true,
            staleTime: 5_000,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {DEMO_MODE ? <StoreSync /> : <ServerSync />}
      <SessionProvider>{children}</SessionProvider>
      <Toaster position="top-center" richColors closeButton toastOptions={{ duration: 4000 }} />
    </QueryClientProvider>
  );
}

/** Rafraîchissement périodique léger : déclenche aussi le rattrapage des tâches planifiées. */
export function useHeartbeat(enabled: boolean) {
  return useQuery({
    queryKey: ["heartbeat"],
    queryFn: () => api.notifications.unreadNotificationCount(),
    refetchInterval: 15_000,
    enabled,
  });
}
