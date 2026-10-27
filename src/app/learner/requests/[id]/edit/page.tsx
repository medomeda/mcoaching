"use client";
import { useParams } from "next/navigation";
import { Alert, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { RequestForm } from "@/components/requests/request-form";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function EditDraftPage() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(["request", id], () => api.requests.getRequestDetail(id));
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  return (
    <>
      <PageHeader back={{ href: `/learner/requests/${id}`, label: "Retour au brouillon" }} title="Modifier le brouillon" />
      {q.data.status !== "DRAFT" ? <Alert tone="warning">Cette demande a déjà été soumise : elle ne peut plus être modifiée.</Alert> : <RequestForm draft={q.data} />}
    </>
  );
}
