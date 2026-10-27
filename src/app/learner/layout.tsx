"use client";
import { Bell, FilePlus2, Home, Inbox, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const NAV: NavItem[] = [
  { href: "/learner", label: "Accueil", icon: <Home className="h-4.5 w-4.5" />, exact: true },
  { href: "/learner/requests/new", label: "Nouvelle demande", icon: <FilePlus2 className="h-4.5 w-4.5" /> },
  { href: "/learner/requests", label: "Mes demandes", icon: <Inbox className="h-4.5 w-4.5" />, exact: true },
  { href: "/learner/coach", label: "Mon coach", icon: <UsersRound className="h-4.5 w-4.5" /> },
  { href: "/learner/entitlement", label: "Mon droit au coaching", icon: <ShieldCheck className="h-4.5 w-4.5" /> },
  { href: "/learner/notifications", label: "Notifications", icon: <Bell className="h-4.5 w-4.5" /> },
  { href: "/learner/profile", label: "Mon profil", icon: <UserRound className="h-4.5 w-4.5" /> },
];

export default function LearnerLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell role="LEARNER" base="/learner" nav={NAV}>
      {children}
    </AppShell>
  );
}
