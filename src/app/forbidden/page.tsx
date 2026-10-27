import { ForbiddenState } from "@/components/ui/display";
import { LinkButton } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-4">
      <ForbiddenState />
      <LinkButton href="/" variant="outline">
        Retour à l’accueil
      </LinkButton>
    </div>
  );
}
