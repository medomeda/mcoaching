"use client";
import { PageHeader } from "@/components/ui/display";
import { UsersTable } from "@/components/admin/users-table";

export default function AdminUsersPage() {
  return (
    <>
      <PageHeader title="Comptes" description="Tous les comptes de la plateforme. Aucun compte n’est supprimé : la désactivation conserve l’historique." />
      <UsersTable />
    </>
  );
}
