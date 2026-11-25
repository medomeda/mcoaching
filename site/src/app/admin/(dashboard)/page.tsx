import { PageHeader } from "@/components/admin/page-header";

export default function AdminHome() {
  return (
    <>
      <PageHeader title="Accueil" description="Alertes et état de vos clients." />
      <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Aucune alerte pour le moment.</p>
    </>
  );
}
