import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { platformUserManagementApi } from "./api";
import type { PlatformManagedUserDetail } from "./types";
import { UserExperienceHistory } from "./UserExperienceHistory";

export function UserDetailDrawer({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { hasPermission } = useAuth();
  const [state, setState] = useState<{ loading: boolean; error: string | null; user: PlatformManagedUserDetail | null }>({ loading: false, error: null, user: null });
  useEffect(() => {
    if (userId === null) return;
    let active = true;
    setState({ loading: true, error: null, user: null });
    platformUserManagementApi.getUser(userId).then((user) => active && setState({ loading: false, error: null, user })).catch(() => active && setState({ loading: false, error: "用户详情读取失败", user: null }));
    return () => { active = false; };
  }, [userId]);

  const user = state.user;
  return (
    <Drawer open={userId !== null} title={user ? `${user.username} · ${user.needoId}` : "用户详情"} onClose={onClose}>
      {state.loading ? <p className="text-sm text-ink/55">正在读取用户详情…</p> : null}
      {state.error ? <div className="rounded-lg border border-coral/30 bg-coral/10 p-4 text-sm font-bold text-coral">{state.error}</div> : null}
      {user ? <div className="space-y-4">
        <DetailSection title="基础信息"><FactGrid facts={[["显示名", user.profile?.displayName ?? user.username], ["NeeDo ID", user.needoId], ["手机", user.phoneBound ? "已绑定" : "未绑定"], ["邮箱", user.emailBound ? "已绑定" : "未绑定"], ["eKYC", user.ekycVerified ? "已验证" : "未验证"], ["来源", user.source.join(" / ") || "—"]]} /><div className="mt-3 rounded-lg border border-line bg-paper p-3 text-sm text-ink/70"><p className="text-xs font-bold text-ink/45">语言能力</p><p className="mt-1">{user.profile?.languages.length ? user.profile.languages.join("、") : "未设置"}</p><p className="mt-3 text-xs font-bold text-ink/45">自我介绍</p><p className="mt-1 whitespace-pre-wrap">{user.profile?.bio || "未设置"}</p></div></DetailSection>
        <DetailSection actions={hasPermission("backoffice:user-membership:write") ? <Button size="sm" to="/admin/membership-tiers" variant="secondary">管理会员规则</Button> : null} title="会员与经验"><FactGrid facts={[["会员类型", user.membership.tierCode], ["会员倍率", `×${user.membership.experienceMultiplier}`], ["当前等级", user.experience ? `Lv.${user.experience.currentLevel}` : "不适用"], ["累计经验", user.experience ? `${user.experience.totalExpUnits} EXP` : "不适用"]]} />{user.experience ? <div className="mt-3"><UserExperienceHistory userId={user.id} /></div> : null}</DetailSection>
        <DetailSection title="预约与消费"><FactGrid facts={[["预约总数", String(user.bookingSpend.totalBookings)], ["完成服务", String(user.bookingSpend.completedBookings)], ["完成消费", `¥${user.bookingSpend.completedSpendJpy.toLocaleString()}`], ["NDP可用余额", user.ndpBalance.available.toLocaleString()]]} /></DetailSection>
        <DetailSection title="账号、角色与权限"><div className="flex flex-wrap gap-2">{user.account.roles.map((role) => <Badge key={`${role.code}-${role.scopeType}-${role.scopeId}`}>{role.name}</Badge>)}</div><div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-line bg-paper p-3 text-xs text-ink/60">{Array.from(new Set(user.account.roles.flatMap((role) => role.permissions))).sort().join(" · ") || "无附加权限"}</div></DetailSection>
        <DetailSection actions={hasPermission("backoffice:user-group:write") ? <Button size="sm" to="/admin/user-groups" variant="secondary">维护分组</Button> : null} title="用户分组"><div className="flex flex-wrap gap-2">{user.groups.length ? user.groups.map((group) => <Badge key={group} tone="blue">{group}</Badge>) : <span className="text-sm text-ink/50">未加入分组</span>}</div></DetailSection>
        <DetailSection title="审计记录">{user.audit.list.length ? <div className="divide-y divide-line rounded-lg border border-line">{user.audit.list.map((event) => <div className="px-3 py-2 text-xs" key={event.id}><strong>{event.action}</strong><span className="ml-2 text-ink/45">{event.actorName} · {new Date(event.createdAt).toLocaleString()}</span></div>)}</div> : <p className="text-sm text-ink/50">暂无可展示的审计记录</p>}</DetailSection>
      </div> : null}
    </Drawer>
  );
}

function DetailSection({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return <section className="rounded-xl border border-line bg-white p-4"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-black text-ink">{title}</h3>{actions}</div>{children}</section>;
}
function FactGrid({ facts }: { facts: Array<[string, string]> }) {
  return <div className="grid gap-2 sm:grid-cols-2">{facts.map(([label, value]) => <div className="rounded-lg bg-paper p-3" key={label}><p className="text-xs font-bold text-ink/45">{label}</p><p className="mt-1 break-words text-sm font-bold text-ink">{value}</p></div>)}</div>;
}
