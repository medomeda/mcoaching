"use client";
import { RequestDetailPage } from "@/components/requests/request-detail";

export default function CoachRequestPage() {
  return <RequestDetailPage role="COACH" listHref="/coach/requests" />;
}
