import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import "./registerI18n";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { platformUserManagementApi } from "./api";
import type { UserGroup } from "./types";
import { UserGroupEditor } from "./UserGroupEditor";
import { UserGroupMembersDrawer } from "./UserGroupMembersDrawer";

const expectedSystemGroups = ["system:free", "system:silver", "system:gold", "system:black_diamond", "system:operations"] as const;

export function UserGroupsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("backoffice:user-group:write");
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [membersGroup, setMembersGroup] = useState<UserGroup | null>(null);

  useEffect(() => {
    let active = true; setLoading(true); setError(null);
    platformUserManagementApi.listGroups({ page: 1, page_size: 100 }).then((data) => { if (active) setGroups(data.list); }).catch(() => active && setError("用户分组读取失败")).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reloadToken]);

  const refresh = () => setReloadToken((value) => value + 1);
  const openCreate = () => { setEditingGroup(null); setEditorOpen(true); };
  const missingSystemGroups = expectedSystemGroups.filter((code) => !groups.some((group) => group.code === code));

  return <AdminLayout><ModuleShell title="用户分组" description="系统分组自动随会员资格与运营角色变化；自定义分组由运营人员维护。" actions={canWrite ? <Button onClick={openCreate}>添加分组</Button> : undefined}>
    <div className="rounded-lg border border-sky/25 bg-sky/10 px-4 py-3 text-sm text-ink/65">会员分组与运营成员可以重叠。系统分组名称固定，不能重命名、归档或手动增删成员。</div>
    {loading ? <div className="rounded-xl border border-line bg-white p-10 text-center text-sm font-bold text-ink/50">正在读取用户分组…</div> : null}
    {error ? <div className="rounded-xl border border-coral/25 bg-white p-10 text-center"><p className="text-sm font-bold text-coral">{error}</p><Button className="mt-4" onClick={refresh} variant="secondary">重新加载</Button></div> : null}
    {!loading && !error && missingSystemGroups.length ? <div className="rounded-lg border border-coral/30 bg-coral/5 p-3 text-sm font-bold text-coral">正式接口缺少系统分组：{missingSystemGroups.join("、")}</div> : null}
    {!loading && !error ? <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-paper text-xs text-ink/55"><tr>{["分组名称", "类型", "简介", "人数", "状态", "操作"].map((title) => <th className="px-4 py-3" key={title}>{title}</th>)}</tr></thead><tbody className="divide-y divide-line">{groups.map((group) => <tr key={group.code}><td className="px-4 py-3"><p className="font-black">{group.name}</p><p className="text-xs text-ink/40">{group.code}</p></td><td className="px-4 py-3"><Badge tone={group.kind === "system" ? "blue" : "green"}>{group.kind === "system" ? "系统自动" : "自定义"}</Badge></td><td className="max-w-[360px] px-4 py-3 text-ink/60">{group.description || "未设置"}</td><td className="px-4 py-3 font-black">{group.memberCount}</td><td className="px-4 py-3"><Badge tone={group.status === "active" ? "green" : "neutral"}>{group.status === "active" ? "启用" : "已归档"}</Badge></td><td className="px-4 py-3"><div className="flex gap-3"><button className="font-bold text-moss" onClick={() => setMembersGroup(group)} type="button">成员</button>{group.kind === "custom" && canWrite && group.status === "active" ? <button className="font-bold text-sky" onClick={() => { setEditingGroup(group); setEditorOpen(true); }} type="button">编辑</button> : null}</div></td></tr>)}</tbody></table></section> : null}
    <UserGroupEditor group={editingGroup} onClose={() => setEditorOpen(false)} onSaved={refresh} open={editorOpen} />
    <UserGroupMembersDrawer group={membersGroup} onClose={() => setMembersGroup(null)} onSaved={refresh} />
  </ModuleShell></AdminLayout>;
}
