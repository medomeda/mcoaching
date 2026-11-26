"use client";
import { LogoMark } from "@/components/ui/logo-mark";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { useBranding } from "@/lib/branding";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { name, notice, organization } = useBranding();
  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700 lg:flex-row">
      <section className="hidden flex-1 flex-col justify-between p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <LogoMark size="lg" />
          <span className="text-lg font-semibold">{name}</span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">Un accompagnement individuel suivi, traçable et dans les délais.</h1>
          <ul className="space-y-2 text-sm text-brand-100">
            <li>• Chaque demande a un responsable identifiable.</li>
            <li>• Chaque échéance de réponse est calculée en heures ouvrées.</li>
            <li>• Chaque échange et chaque action importante sont tracés.</li>
          </ul>
        </div>
        <div className="space-y-2 text-xs text-brand-200">
          {organization?.name && <p className="text-sm font-medium text-white">{organization.name}</p>}
          {organization?.description && <p>{organization.description}</p>}
          {(organization?.contact_email || organization?.contact_phone || organization?.website_url) && (
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {organization.contact_email && <a href={`mailto:${organization.contact_email}`} className="hover:underline">{organization.contact_email}</a>}
              {organization.contact_phone && <a href={`tel:${organization.contact_phone.replace(/[^+0-9]/g, "")}`} className="hover:underline">{organization.contact_phone}</a>}
              {organization.website_url && <a href={organization.website_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{organization.website_url.replace(/^https?:\/\//i, "")}</a>}
            </p>
          )}
          {notice && <p className="text-brand-300">{notice}</p>}
        </div>
      </section>
      <section className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center lg:max-w-xl lg:bg-canvas">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2 text-white lg:hidden">
            <LogoMark />
            <span className="text-lg font-semibold">{name}</span>
          </div>
          <Suspense>{children}</Suspense>
        </div>
      </section>
    </div>
  );
}
