"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Loading } from "@/components/ui/display";
import { api, ApiError, DEMO_MODE } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { currentEndpoint, disablePush, enablePush, pushSupport, type PushSupport } from "./push-client";

/** Carte « Notifications » du profil : activation du push appareil par appareil. Absente en démonstration. */
export function PushSettings() {
  const state = useApi(["push-state"], () => api.push.state(), { enabled: !DEMO_MODE });
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshDevice = useCallback(async () => {
    setSupport(await pushSupport().catch(() => "unsupported" as const));
    setEndpoint(await currentEndpoint());
  }, []);

  useEffect(() => {
    if (!DEMO_MODE) void refreshDevice();
  }, [refreshDevice]);

  if (DEMO_MODE) return null;

  const refresh = async () => {
    await refreshDevice();
    await state.refetch();
  };

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "L’opération a échoué. Réessayez.");
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const enable = () =>
    act(async () => {
      const r = await enablePush(state.data!.publicKey!);
      if (r.ok) toast.success("Notifications activées sur cet appareil.");
      else toast.error(r.message);
    });
  const test = () =>
    act(async () => {
      const { sent } = await api.push.test();
      if (sent > 0) toast.success("Notification de test envoyée.");
      else toast.error("Aucun appareil n’a pu recevoir la notification.");
    });
  const disable = () =>
    act(async () => {
      await disablePush();
      toast.success("Notifications désactivées sur cet appareil.");
    });

  const thisDevice = endpoint !== null && (state.data?.endpoints.includes(endpoint) ?? false);

  let content: React.ReactNode;
  if (state.isLoading || support === null) content = <Loading />;
  else if (state.error || !state.data) content = <p>Impossible de lire l’état des notifications pour le moment.</p>;
  else if (!state.data.available) content = <p>Non disponible sur cette instance.</p>;
  else if (support === "ios-not-installed") content = <p>Sur iPhone, installez d’abord l’application sur l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis ouvrez-la pour activer les notifications.</p>;
  else if (support === "unsupported") content = <p>Ce navigateur ne prend pas en charge les notifications push.</p>;
  else if (support === "no-service-worker") content = <p>Les notifications ne sont disponibles que dans l’application déployée, pas en mode développement.</p>;
  else if (thisDevice)
    content = (
      <>
        <p>Les notifications sont activées sur cet appareil.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void test()}>
            Envoyer un test
          </Button>
          <Button size="sm" variant="outline" loading={busy} onClick={() => void disable()}>
            Désactiver
          </Button>
        </div>
      </>
    );
  else
    content = (
      <>
        <p>Recevez une alerte sur cet appareil quand un événement vous concerne.</p>
        <Button size="sm" loading={busy} onClick={() => void enable()} icon={<Bell className="h-4 w-4" />}>
          Activer les notifications
        </Button>
      </>
    );

  return (
    <Card>
      <CardHeader title="Notifications" icon={<Bell className="h-4 w-4" />} />
      <CardBody className="space-y-3 text-sm text-slate-700">
        {content}
        <p className="text-xs text-slate-500">L’écran verrouillé n’affiche que le type de notification (par exemple « Nouveau message »), jamais le contenu des échanges.</p>
      </CardBody>
    </Card>
  );
}
