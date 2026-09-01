import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { platformUserManagementApi } from "./api";
import type { Paginated, PlatformManagedUser, PlatformTierCode, UserListQuery } from "./types";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { UserFilters } from "./UserFilters";

const tierLabels: Record<PlatformTierCode, string> = { free: "免费", silver: "白银", gold: "黄金", black_diamond: "黑钻" };

export function UserListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const query = useMemo<UserListQuery>(() => ({
    page: Math.max(1, Number(searchParams.get("page")) || 1), page_size: 20,
    keyword: searchParams.get("keyword") || undefined,
    tier: (searchParams.get("tier") as PlatformTierCode | null) ?? undefined,
    identityType: searchParams.get("identityType") || undefined,
    state: (searchParams.get("state") as UserListQuery["state"]) || undefined,
    ekyc: (searchParams.get("ekyc") as UserListQuery["ekyc"]) || undefined
  }), [searchParams]);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Paginated<PlatformManagedUser> | null }>({ loading: true, error: null, data: null });

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    platformUserManagementApi.listUsers(query).then((data) => active && setState({ loading: false, error: null, data })).catch(() => active && setState({ loading: false, error: "用户列表读取失败", data: null }));
    return () => { active = false; };
  }, [query, reloadToken]);

  const updateQuery = (next: Partial<UserListQuery>) => {
    const params = new URLSearchParams();
    const merged = { ...query, ...next, page_size: undefined };
    Object.entries(merged).forEach(([key, value]) => { if (value !== undefined && value !== "" && !(key === "page" && value === 1)) params.set(key, String(value)); });
    setSearchParams(params, { replace: true });
  };
  const data = state.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <ModuleShell title="用户列表" description="分页查看全部正式用户、身份、会员、经验与绑定状态。">
      <UserFilters value={{ keyword: query.keyword, tier: query.tier, identityType: query.identityType, state: query.state, ekyc: query.ekyc }} onReset={() => setSearchParams({}, { replace: true })} onSubmit={(filters) => updateQuery({ ...filters, page: 1 })} />
      <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        {state.loading ? <div className="p-10 text-center text-sm font-bold text-ink/50">正在读取全部用户…</div> : null}
        {state.error ? <div className="p-10 text-center"><p className="text-sm font-bold text-coral">{state.error}</p><Button className="mt-4" onClick={() => setReloadToken((value) => value + 1)} variant="secondary">重新加载</Button></div> : null}
        {!state.loading && !state.error && data?.list.length === 0 ? <div className="p-10 text-center text-sm font-bold text-ink/50">没有符合条件的用户</div> : null}
        {!state.loading && !state.error && data?.list.length ? <UserTable rows={data.list} onSelect={setSelectedUserId} /> : null}
        {data && data.total > 0 ? <footer className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink/55"><span>共 {data.total} 位用户</span><div className="flex items-center gap-2"><Button disabled={query.page === 1} onClick={() => updateQuery({ page: Math.max(1, (query.page ?? 1) - 1) })} size="sm" variant="secondary">上一页</Button><span>{query.page} / {totalPages}</span><Button disabled={(query.page ?? 1) >= totalPages} onClick={() => updateQuery({ page: (query.page ?? 1) + 1 })} size="sm" variant="secondary">下一页</Button></div></footer> : null}
      </section>
      <UserDetailDrawer onClose={() => setSelectedUserId(null)} userId={selectedUserId} />
    </ModuleShell>
  );
}

function UserTable({ rows, onSelect }: { rows: PlatformManagedUser[]; onSelect: (id: number) => void }) {
  return <div className="overflow-x-auto"><table className="min-w-[1180px] w-full text-left text-sm"><thead className="bg-paper text-xs text-ink/55"><tr>{["用户", "身份", "会员与等级", "绑定", "eKYC", "NDP", "预约", "状态", "注册时间", "操作"].map((title) => <th className="px-4 py-3 font-black" key={title}>{title}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((row) => <tr className="hover:bg-paper/70" key={row.id}>
    <td className="px-4 py-3"><div className="flex items-center gap-3"><img alt="" className="h-10 w-10 rounded-full border border-line object-cover" src={row.avatarUrl || "/images/generated/profiles/profile-03.jpg"} /><div><p className="font-black text-ink">{row.username}</p><p className="text-xs text-ink/45">{row.needoId}</p></div></div></td>
    <td className="px-4 py-3"><div className="flex max-w-[200px] flex-wrap gap-1">{row.identities.map((identity) => <Badge key={`${identity.type}-${identity.scopeId}`}>{identity.displayName || identity.type}</Badge>)}</div></td>
    <td className="px-4 py-3"><p className="font-bold">{tierLabels[row.membership.tierCode]}会员</p><p className="mt-1 text-xs text-ink/50">{row.experience ? `Lv.${row.experience.currentLevel} · ${row.experience.totalExpUnits} EXP` : "技师/商户不显示等级"}</p></td>
    <td className="px-4 py-3 text-xs"><p className={row.phoneBound ? "text-[#2f6846]" : "text-ink/40"}>{row.phoneBound ? "手机已绑定" : "手机未绑定"}</p><p className={row.emailBound ? "mt-1 text-[#2f6846]" : "mt-1 text-ink/40"}>{row.emailBound ? "邮箱已绑定" : "邮箱未绑定"}</p></td>
    <td className="px-4 py-3"><Badge tone={row.ekycVerified ? "green" : "neutral"}>{row.ekycVerified ? "已验证" : "未验证"}</Badge></td><td className="px-4 py-3 font-bold">{row.ndpBalance.available.toLocaleString()}</td><td className="px-4 py-3">{row.bookingCount}</td><td className="px-4 py-3"><Badge tone={row.isActive ? "green" : "red"}>{row.isActive ? "正常" : "停用"}</Badge></td><td className="px-4 py-3 text-xs text-ink/55">{new Date(row.createdAt).toLocaleString()}</td><td className="px-4 py-3"><button className="font-bold text-moss hover:underline" onClick={() => onSelect(row.id)} type="button">详情</button></td>
  </tr>)}</tbody></table></div>;
}
