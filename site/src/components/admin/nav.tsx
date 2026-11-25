"use client";

import { Compass, Gauge, LogOut, ScrollText, Tags, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

const ITEMS = [
  { href: "/admin", label: "Accueil", icon: Gauge, exact: true },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/prospects", label: "Prospects", icon: UserPlus },
  { href: "/admin/formules", label: "Formules", icon: Tags },
  { href: "/admin/journal", label: "Journal", icon: ScrollText },
] as const;

export function AdminNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    <aside className="border-b border-slate-200 bg-brand-900 text-white md:min-h-screen md:border-b-0">
      <div className="flex items-center gap-2 px-4 py-4 font-bold"><Compass className="size-5 text-gold-500" aria-hidden />Mentora · opérateur</div>
      <nav aria-label="Navigation du tableau de bord" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:pb-0">
        {ITEMS.map((i) => {
          const active = "exact" in i ? path === i.href : path.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? "bg-white/15 font-semibold" : "text-brand-100 hover:bg-white/10"}`}>
              <i.icon className="size-4 shrink-0" aria-hidden />{i.label}
            </Link>
          );
        })}
        <button
          onClick={async () => { await authClient.signOut(); router.replace("/admin/login"); router.refresh(); }}
          className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-brand-100 hover:bg-white/10 md:mt-6"
        >
          <LogOut className="size-4" aria-hidden />Se déconnecter
        </button>
      </nav>
    </aside>
  );
}
