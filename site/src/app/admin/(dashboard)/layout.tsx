import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AdminNav } from "@/components/admin/nav";
import { OperatorAuthError, requireOperator } from "@/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  try {
    await requireOperator(await headers());
  } catch (e) {
    if (e instanceof OperatorAuthError) redirect(e.code === "TWO_FACTOR_REQUIRED" ? "/admin/two-factor" : "/admin/login");
    throw e;
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <AdminNav />
      <main className="min-w-0 p-4 sm:p-6">{children}</main>
    </div>
  );
}
