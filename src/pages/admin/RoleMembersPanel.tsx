import { useEffect, useState } from "react";
import {
  userManagementApi,
  type PaginatedData,
  type RolePayload,
  type UserPayload
} from "../../api/userManagement";
import { Badge } from "../../components/ui/Badge";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Button } from "../../components/ui/Button";

export type RoleMembersCopy = {
  active: string;
  disabled: string;
  empty: string;
  loading: string;
  members: string;
  nextPage: string;
  previousPage: string;
  retry: string;
  scope: string;
  pageSummary: (page: number, totalPages: number) => string;
};

const emptyMembers: PaginatedData<UserPayload> = {
  list: [],
  page: 1,
  page_size: 20,
  total: 0
};

export function RoleMembersPanel({ copy, role }: { copy: RoleMembersCopy; role: RolePayload }) {
  const [isOpen, setIsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState(emptyMembers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    let alive = true;
    setLoading(true);
    setError("");
    userManagementApi
      .listUsers({ roleId: role.id, page, pageSize: 20 })
      .then((response) => {
        if (alive) setMembers(response);
      })
      .catch((loadError: unknown) => {
        if (alive) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [isOpen, page, retryKey, role.id]);

  const totalPages = Math.max(1, Math.ceil(members.total / members.page_size));

  return (
    <details
      className="mt-3 overflow-hidden rounded-xl border border-line bg-paper"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-black text-ink/70 marker:content-none">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-lg bg-moss/15 text-moss">●</span>
          {copy.members}
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs text-ink/50">
          {isOpen && !loading ? members.total : "›"}
        </span>
      </summary>

      <div className="border-t border-line bg-white p-3">
        {loading ? <p className="py-4 text-center text-sm font-bold text-ink/45">{copy.loading}</p> : null}
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-coral/10 px-3 py-2">
            <p className="min-w-0 text-sm font-bold text-[#a63f32]">{error}</p>
            <Button onClick={() => setRetryKey((current) => current + 1)} size="sm" variant="secondary">
              {copy.retry}
            </Button>
          </div>
        ) : null}
        {!loading && !error && members.list.length === 0 ? (
          <p className="py-4 text-center text-sm font-bold text-ink/45">{copy.empty}</p>
        ) : null}
        {!loading && !error ? (
          <ul className="grid gap-2">
            {members.list.map((user) => {
              const assignments = user.roleAssignments.filter(
                (assignment) => assignment.roleId === role.id
              );
              return (
                <li className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5" key={user.id}>
                  <AvatarImage alt="" className="h-9 w-9 rounded-full object-cover" src={user.avatarUrl ?? undefined} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-ink">{user.username}</p>
                    <p className="truncate text-xs font-semibold text-ink/45">{user.email}</p>
                    {assignments.map((assignment) => (
                      <p className="mt-1 text-xs font-bold text-ink/45" key={assignment.id}>
                        {copy.scope}：{assignment.scopeType ?? "global"}{assignment.scopeId ? `:${assignment.scopeId}` : ""}
                      </p>
                    ))}
                  </div>
                  <Badge tone={user.isActive ? "green" : "red"}>
                    {user.isActive ? copy.active : copy.disabled}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : null}

        {!loading && !error && members.total > members.page_size ? (
          <nav aria-label={copy.members} className="mt-3 flex items-center justify-center gap-3">
            <Button
              disabled={members.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="sm"
              variant="secondary"
            >
              {copy.previousPage}
            </Button>
            <span className="text-xs font-bold text-ink/50">{copy.pageSummary(members.page, totalPages)}</span>
            <Button
              disabled={members.page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              size="sm"
              variant="secondary"
            >
              {copy.nextPage}
            </Button>
          </nav>
        ) : null}
      </div>
    </details>
  );
}
