"use client";
import * as D from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { Bell, ChevronDown, LogOut, Menu, TrendingUp, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "@/modules/core/types";
import { ROLE_LABELS } from "@/lib/labels";
import { Avatar, ForbiddenState, Loading } from "@/components/ui/display";
import { LinkButton } from "@/components/ui/button";
import { homeFor, useHeartbeat, useSession } from "@/components/providers";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  exact?: boolean;
  badge?: number;
}

function isActive(pathname: string, item: NavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500 text-white shadow-sm">
        <TrendingUp className="h-5 w-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-white">Coaching BRVM</span>
        <span className="block text-[11px] text-brand-200">Accompagnement individuel</span>
      </span>
    </Link>
  );
}

function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigation principale" className="space-y-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white/12 text-white" : "text-brand-100 hover:bg-white/8 hover:text-white",
            )}
          >
            <span className={clsx("h-4.5 w-4.5 shrink-0", active ? "text-gold-100" : "text-brand-300")} aria-hidden>
              {item.icon}
            </span>
            <span className="flex-1 truncate">{item.label}</span>
            {!!item.badge && <span className="rounded-full bg-gold-500 px-1.5 text-xs font-semibold tabular-nums text-white">{item.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu({ base }: { base: string }) {
  const { user, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={user.full_name} className="h-8 w-8" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-slate-800">{user.full_name}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">{user.email}</div>
          <Link role="menuitem" href={`${base}/profile`} onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <UserRound className="h-4 w-4" /> Mon profil
          </Link>
          <button role="menuitem" onClick={() => void logout()} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <LogOut className="h-4 w-4" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ role, base, nav, children }: { role: Role; base: string; nav: NavItem[]; children: ReactNode }) {
  const { user, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  const heartbeat = useHeartbeat(status === "authenticated" && user?.role === role);
  const unread = heartbeat.data ?? 0;

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated" || !user) return <Loading className="min-h-dvh" />;
  if (user.role !== role) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center p-4">
        <ForbiddenState message={`Cet espace est réservé au rôle « ${ROLE_LABELS[role]} ».`} />
        <LinkButton href={homeFor(user.role)} variant="outline">
          Retourner à mon espace
        </LinkButton>
      </div>
    );
  }

  const items = nav.map((n) => (n.href === `${base}/notifications` ? { ...n, badge: unread } : n));

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand-900 px-3 py-5 lg:flex">
        <Brand />
        <div className="mt-8 flex-1 overflow-y-auto">
          <NavList items={items} pathname={pathname} />
        </div>
        <p className="px-3 text-[11px] leading-snug text-brand-300">Plateforme pédagogique : les échanges ne constituent pas des recommandations d’investissement automatisées.</p>
      </aside>

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-brand-900 px-3 py-5 shadow-xl focus:outline-none lg:hidden">
            <D.Title className="sr-only">Menu</D.Title>
            <D.Description className="sr-only">Navigation de l’espace {ROLE_LABELS[role]}</D.Description>
            <div className="flex items-center justify-between">
              <Brand />
              <D.Close className="rounded-md p-1.5 text-brand-200 hover:bg-white/10" aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </D.Close>
            </div>
            <div className="mt-8 flex-1 overflow-y-auto">
              <NavList items={items} pathname={pathname} onNavigate={() => setDrawer(false)} />
            </div>
          </D.Content>
        </D.Portal>
      </D.Root>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
        <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-medium text-slate-500 lg:hidden">Coaching BRVM</span>
        <div className="flex-1" />
        <Link href={`${base}/notifications`} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`}>
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
        </Link>
        <UserMenu base={base} />
      </header>

      <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-24 sm:px-5 lg:px-8 lg:py-7">{children}</main>
    </div>
  );
}
