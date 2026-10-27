"use client";
import { BarChart3, Bell, FileClock, GraduationCap, Inbox, LayoutDashboard, Link2, Settings, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Tableau de bord", icon: <LayoutDashboard className="h-4.5 w-4.5" />, exact: true },
  { href: "/admin/requests", label: "Demandes de coaching", icon: <Inbox className="h-4.5 w-4.5" /> },
  { href: "/admin/learners", label: "Apprenants", icon: <GraduationCap className="h-4.5 w-4.5" /> },
  { href: "/admin/coaches", label: "Coachs", icon: <UsersRound className="h-4.5 w-4.5" /> },
  { href: "/admin/assignments", label: "Affectations", icon: <Link2 className="h-4.5 w-4.5" /> },
  { href: "/admin/entitlements", label: "Droits et quotas", icon: <ShieldCheck className="h-4.5 w-4.5" /> },
  { href: "/admin/reports", label: "Rapports", icon: <BarChart3 className="h-4.5 w-4.5" /> },
  { href: "/admin/notifications", label: "Notifications", icon: <Bell className="h-4.5 w-4.5" /> },
  { href: "/admin/users", label: "Comptes", icon: <UserCog className="h-4.5 w-4.5" /> },
  { href: "/admin/settings", label: "Paramètres", icon: <Settings className="h-4.5 w-4.5" /> },
  { href: "/admin/audit", label: "Journal d’audit", icon: <FileClock className="h-4.5 w-4.5" /> },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell role="ADMIN" base="/admin" nav={NAV}>
      {children}
    </AppShell>
  );
}

