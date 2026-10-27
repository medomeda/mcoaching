"use client";
import { RequestDetailPage } from "@/components/requests/request-detail";

export default function AdminRequestPage() {
  return <RequestDetailPage role="ADMIN" listHref="/admin/requests" />;
}
