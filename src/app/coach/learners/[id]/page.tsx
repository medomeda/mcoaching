"use client";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, CardBody, DescriptionList, ErrorState, Loading, PageHeader } from "@/components/ui/display";
import { RequestList } from "@/components/requests/request-list";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { ENTITLEMENT_STATUS_LABELS } from "@/lib/labels";

export default function CoachLearnerDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useApi(["coach-learner", id], () => api.coaches.coachLearnerDetail(id));
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  const d = q.data!;
  return (
    <div className="space-y-4">
      <PageHeader back={{ href: "/coach/learners", label: "Mes apprenants" }} title={d.learner.full_name} />
      <Card>
        <CardBody>
          <DescriptionList
            items={[
              ["Droit au coaching", <Badge key="s" tone={d.entitlement_status === "ACTIVE" ? "success" : "warning"}>{ENTITLEMENT_STATUS_LABELS[d.entitlement_status]}</Badge>],
              ["Quota", d.quota.enabled ? `${d.quota.remaining} restante(s) sur ${(d.quota.limit ?? 0) + d.quota.corrections}` : "Aucune limite"],
            ]}
          />
        </CardBody>
      </Card>
      <h2 className="text-sm font-semibold text-slate-700">Demandes que vous suivez</h2>
      <Suspense>
        <LearnerRequests learnerId={id} />
      </Suspense>
    </div>
  );
}

function LearnerRequests({ learnerId }: { learnerId: string }) {
  return <RequestList role="COACH" base="/coach/requests" learnerId={learnerId} />;
}
