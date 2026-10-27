"use client";
import { Bell, CalendarClock, Inbox, LayoutDashboard, UserRound, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const NAV: NavItem[] = [
  { href: "/coach", label: "Tableau de bord", icon: <LayoutDashboard className="h-4.5 w-4.5" />, exact: true },
  { href: "/coach/requests", label: "Mes demandes", icon: <Inbox className="h-4.5 w-4.5" /> },
  { href: "/coach/learners", label: "Mes apprenants", icon: <UsersRound className="h-4.5 w-4.5" /> },
  { href: "/coach/availability", label: "Disponibilités et absences", icon: <CalendarClock className="h-4.5 w-4.5" /> },
  { href: "/coach/notifications", label: "Notifications", icon: <Bell className="h-4.5 w-4.5" /> },
  { href: "/coach/profile", label: "Mon profil", icon: <UserRound className="h-4.5 w-4.5" /> },
];

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell role="COACH" base="/coach" nav={NAV}>
      {children}
    </AppShell>
  );
}
