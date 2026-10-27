"use client";
import { PageHeader } from "@/components/ui/display";
import { RequestForm } from "@/components/requests/request-form";

export default function NewRequestPage() {
  return (
    <>
      <PageHeader back={{ href: "/learner/requests", label: "Mes demandes" }} title="Nouvelle demande" description="Posez votre question à votre coach. Vous pouvez l’enregistrer en brouillon avant de la soumettre." />
      <RequestForm />
    </>
  );
}
