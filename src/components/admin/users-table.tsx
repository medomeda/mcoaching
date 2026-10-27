"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ROLES, type Role, type UserStatus } from "@/modules/core/types";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, EmptyState, ErrorState, Loading, Pagination } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { ENTITLEMENT_STATUS_LABELS, ROLE_LABELS, USER_STATUS_LABELS } from "@/lib/labels";
import { CreateUserDialog } from "./user-dialogs";

export function UserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge tone={status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "danger" : "warning"}>{USER_STATUS_LABELS[status]}</Badge>;
}

export function UsersTable({ role }: { role?: Role }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">(role ?? "");
  const [status, setStatus] = useState<UserStatus | "">("");
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [debounced, roleFilter, status]);

  const filters = { q: debounced || undefined, role: roleFilter || undefined, status: status || undefined, page, pageSize: 20 };
  const list = useApi(["users", filters], () => api.users.listUsers(filters), { placeholderData: keepPreviousData });

  return (
    <Card>
      <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:px-5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input aria-label="Rechercher" placeholder="Nom ou e-mail…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!role && (
          <Select aria-label="Rôle" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} className="sm:w-44">
            <option value="">Tous les rôles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Statut" value={status} onChange={(e) => setStatus(e.target.value as UserStatus | "")} className="sm:w-52">
          <option value="">Tous les statuts</option>
          {(["ACTIVE", "PENDING_ACTIVATION", "SUSPENDED"] as const).map((s) => (
            <option key={s} value={s}>
              {USER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreate(true)}>
          {role === "LEARNER" ? "Nouvel apprenant" : role === "COACH" ? "Nouveau coach" : "Nouveau compte"}
        </Button>
      </div>
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data!.items.length === 0 ? (
        <EmptyState filtered={!!(debounced || status || (!role && roleFilter))} title={debounced || status ? "Aucun résultat" : "Aucun compte"} action={<Button size="sm" onClick={() => setCreate(true)}>Créer un compte</Button>} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Utilisateur</th>
                  {!role && <th className="px-3 py-2.5 font-medium">Rôle</th>}
                  <th className="px-3 py-2.5 font-medium">Statut</th>
                  {(role === "LEARNER" || !role) && <th className="px-3 py-2.5 font-medium">Coach affecté</th>}
                  {(role === "LEARNER" || !role) && <th className="px-3 py-2.5 font-medium">Droit</th>}
                  <th className="px-3 py-2.5 font-medium">Créé le</th>
                  <th className="px-3 py-2.5 font-medium">Dernière connexion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data!.items.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2.5">
                        <Avatar name={u.full_name} className="h-8 w-8" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-slate-900 hover:text-brand-700">{u.full_name}</span>
                          <span className="block truncate text-xs text-slate-500">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    {!role && <td className="px-3 py-2.5 text-slate-600">{ROLE_LABELS[u.role]}</td>}
                    <td className="px-3 py-2.5">
                      <UserStatusBadge status={u.status} />
                    </td>
                    {(role === "LEARNER" || !role) && <td className="px-3 py-2.5 text-slate-600">{u.role === "LEARNER" ? (u.coach?.full_name ?? <Badge tone="warning">Aucun</Badge>) : "—"}</td>}
                    {(role === "LEARNER" || !role) && (
                      <td className="px-3 py-2.5">
                        {u.entitlement_status ? <Badge tone={u.entitlement_status === "ACTIVE" ? "success" : u.entitlement_status === "NONE" ? "neutral" : "warning"}>{ENTITLEMENT_STATUS_LABELS[u.entitlement_status]}</Badge> : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-slate-600">{fmtDate(u.created_at)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{u.last_login_at ? fmtDateTime(u.last_login_at) : "Jamais"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={list.data!.page} pages={list.data!.pages} total={list.data!.total} onPage={setPage} />
        </>
      )}
      <CreateUserDialog open={create} onOpenChange={setCreate} defaultRole={role ?? "LEARNER"} lockRole={!!role} />
    </Card>
  );
}
