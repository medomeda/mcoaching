"use client";
import { PageHeader } from "@/components/ui/display";
import { UsersTable } from "@/components/admin/users-table";

export default function AdminLearnersPage() {
  return (
    <>
      <PageHeader title="Apprenants" description="Comptes apprenants, coach affecté et statut du droit au coaching." />
      <UsersTable role="LEARNER" />
    </>
  );
}
