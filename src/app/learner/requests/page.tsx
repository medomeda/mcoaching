"use client";
import { FilePlus2 } from "lucide-react";
import { Suspense } from "react";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/display";
import { RequestList } from "@/components/requests/request-list";

export default function LearnerRequestsPage() {
  return (
    <>
      <PageHeader title="Mes demandes" description="Suivez vos demandes de coaching et leurs échanges." actions={<LinkButton href="/learner/requests/new" icon={<FilePlus2 className="h-4 w-4" />}>Nouvelle demande</LinkButton>} />
      <Suspense>
        <RequestList role="LEARNER" base="/learner/requests" emptyAction={<LinkButton href="/learner/requests/new">Créer ma première demande</LinkButton>} />
      </Suspense>
    </>
  );
}
