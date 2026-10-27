"use client";
import { PageHeader } from "@/components/ui/display";
import { NotificationsList } from "@/components/shared/notifications-list";

export default function LearnerNotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" />
      <NotificationsList base="/learner" />
    </>
  );
}
