"use client";
import { RequestDetailPage } from "@/components/requests/request-detail";

export default function LearnerRequestPage() {
  return <RequestDetailPage role="LEARNER" listHref="/learner/requests" />;
}
