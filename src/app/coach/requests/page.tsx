"use client";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/display";
import { RequestList } from "@/components/requests/request-list";

export default function CoachRequestsPage() {
  return (
    <>
      <PageHeader title="Mes demandes" description="Demandes dont vous êtes le coach responsable." />
      <Suspense>
        <RequestList role="COACH" base="/coach/requests" />
      </Suspense>
    </>
  );
}
