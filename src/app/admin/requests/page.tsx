"use client";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/display";
import { RequestList } from "@/components/requests/request-list";

export default function AdminRequestsPage() {
  return (
    <>
      <PageHeader title="Demandes de coaching" description="Toutes les demandes soumises. Filtrez par coach, statut, période ou priorité." />
      <Suspense>
        <RequestList role="ADMIN" base="/admin/requests" />
      </Suspense>
    </>
  );
}
