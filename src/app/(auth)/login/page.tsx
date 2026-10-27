"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, LogIn, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardBody } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/form";
import { homeFor, useSession } from "@/components/providers";
import { api, ApiError, DEMO_MODE } from "@/lib/api";
import { ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/labels";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, status, setUser } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : null;

  useEffect(() => {
    if (status === "authenticated" && user) router.replace(safeNext && safeNext.startsWith(homeFor(user.role)) ? safeNext : homeFor(user.role));
  }, [status, user, router, safeNext]);

  const sys = useQuery({ queryKey: ["system-status"], queryFn: () => api.auth.systemStatus() });

  const doLogin = async (em: string, pw: string) => {
    setBusy(true);
    setError(null);
    try {
      const u = await api.auth.login({ email: em, password: pw });
      setUser(u);
      router.replace(safeNext && safeNext.startsWith(homeFor(u.role)) ? safeNext : homeFor(u.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doLogin(email, password);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-5 p-6 sm:p-7">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Connexion</h1>
            <p className="mt-1 text-sm text-slate-500">Accédez à votre espace de coaching.</p>
          </div>
          {params.get("expired") && <Alert tone="warning">Votre session a expiré. Veuillez vous reconnecter.</Alert>}
          {params.get("reset") && <Alert tone="success">Votre mot de passe a été défini. Vous pouvez vous connecter.</Alert>}
          {sys.data && !sys.data.hasUsers && (
            <Alert tone="info" title="Plateforme non initialisée" icon={<ShieldCheck className="h-4 w-4" />}>
              Aucun compte n’existe encore.{" "}
              <Link href="/setup" className="font-medium underline">
                Créer le premier administrateur
              </Link>
              {DEMO_MODE && " ou chargez les données de démonstration ci-dessous."}
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="Adresse e-mail" required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}
            </Field>
            <Field label="Mot de passe" required>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
            </Field>
            <FormError message={error} />
            <Button type="submit" className="w-full" size="lg" loading={busy} icon={<LogIn className="h-4 w-4" />}>
              Se connecter
            </Button>
          </form>
          <div className="text-center text-sm">
            <Link href="/forgot-password" className="text-brand-700 hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>
        </CardBody>
      </Card>
      {DEMO_MODE && <DemoAccess onLogin={(em, pw) => void doLogin(em, pw)} busy={busy} />}
    </div>
  );
}

function DemoAccess({ onLogin, busy }: { onLogin: (email: string, password: string) => void; busy: boolean }) {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["demo-state"], queryFn: () => api.demo.demoState() });
  const [seeding, setSeeding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSeed, setConfirmSeed] = useState(false);
  const seed = async () => {
    setSeeding(true);
    try {
      await api.demo.seedDemo();
      await qc.invalidateQueries();
      toast.success("Données de démonstration chargées.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSeeding(false);
    }
  };
  const accounts = state.data?.accounts ?? [];
  return (
    <Card className="border-dashed border-gold-500/60 bg-gold-100/40">
      <CardBody className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold-700" />
          <h2 className="text-sm font-semibold text-slate-900">Mode démonstration</h2>
          <Badge tone="warning">Hors production</Badge>
        </div>
        {!state.data?.demo_seeded ? (
          <>
            <p className="text-sm text-slate-600">
              Chargez un jeu de données fictif (1 administrateur, 2 coachs, 8 apprenants, demandes dans tous les statuts, retards, évaluations). Il est généré en rejouant les vraies opérations métier.
            </p>
            <Button variant="secondary" loading={seeding} icon={<Database className="h-4 w-4" />} onClick={() => (state.data && sys(qc) ? setConfirmSeed(true) : void seed())}>
              Charger les données de démonstration
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Connexion rapide (mot de passe commun : <code className="rounded bg-white px-1 font-mono text-xs">{state.data.demo_password}</code>). Ouvrez plusieurs onglets pour tester plusieurs rôles en parallèle.
            </p>
            <ul className="divide-y divide-gold-500/20 overflow-hidden rounded-lg border border-gold-500/30 bg-white">
              {accounts.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{a.full_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {ROLE_LABELS[a.role]} · {a.email}
                      {a.status !== "ACTIVE" && ` · ${USER_STATUS_LABELS[a.status]}`}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy || a.status !== "ACTIVE"} onClick={() => onLogin(a.email, state.data!.demo_password!)}>
                    Entrer
                  </Button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmSeed(true)}>
                Recharger la démo
              </Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirmReset(true)}>
                Vider toutes les données
              </Button>
            </div>
          </>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmSeed}
        onOpenChange={setConfirmSeed}
        title="Recharger les données de démonstration ?"
        description="Toutes les données locales actuelles seront remplacées par le jeu de démonstration."
        confirmLabel="Recharger"
        onConfirm={seed}
      />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Vider toutes les données ?"
        description="La base locale sera entièrement réinitialisée (aucun compte). Vous pourrez créer le premier administrateur."
        confirmLabel="Tout effacer"
        tone="danger"
        onConfirm={async () => {
          await api.demo.resetAllData();
          await qc.invalidateQueries();
          toast.success("Données effacées.");
        }}
      />
    </Card>
  );
}

/** Une base contenant déjà des comptes réels doit être confirmée avant d'être écrasée. */
function sys(qc: ReturnType<typeof useQueryClient>): boolean {
  const s = qc.getQueryData<{ hasUsers: boolean }>(["system-status"]);
  return !!s?.hasUsers;
}
