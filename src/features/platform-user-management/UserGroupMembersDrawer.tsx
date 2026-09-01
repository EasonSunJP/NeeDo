import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { platformUserManagementApi } from "./api";
import type { Paginated, UserGroup, UserGroupMember } from "./types";

async function loadAllGroupMemberIds(groupCode: string) {
  const ids: string[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await platformUserManagementApi.listGroupMembers(groupCode, { page, page_size: 100 });
    ids.push(...result.list.map((member) => member.needoId));
    if (ids.length >= result.total) return ids;
  }
  throw new Error("成员超过单次安全编辑上限");
}

export function UserGroupMembersDrawer({ group, onClose, onSaved }: { group: UserGroup | null; onClose: () => void; onSaved: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<UserGroupMember> | null>(null);
  const [memberIds, setMemberIds] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = group?.kind === "custom";

  useEffect(() => {
    if (!group) return;
    let active = true; setLoading(true); setError(null);
    Promise.all([platformUserManagementApi.listGroupMembers(group.code, { page, page_size: 20 }), editable ? loadAllGroupMemberIds(group.code) : Promise.resolve([])])
      .then(([nextData, ids]) => { if (active) { setData(nextData); if (editable) setMemberIds(ids.join("\n")); } })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "成员读取失败"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [editable, group, page]);

  const save = async () => {
    if (!group || !editable || !reason.trim()) return;
    const userIds = Array.from(new Set(memberIds.split(/[\s,，]+/).map((value) => value.trim()).filter(Boolean)));
    setSaving(true); setError(null);
    try { await platformUserManagementApi.setGroupMembers(group.code, { userIds, reason: reason.trim() }); setReason(""); onSaved(); setPage(1); }
    catch { setError("成员变更失败，请确认 NeeDo ID、原因与权限"); } finally { setSaving(false); }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  return <Drawer open={group !== null} title={group ? `${group.name} · 成员` : "分组成员"} onClose={onClose}>
    <p className="mb-4 rounded-lg bg-sky/10 p-3 text-xs leading-5 text-ink/60">这里始终读取当前正式成员。会员分组与运营成员可以重叠；系统分组由会员资格或运营角色自动计算，无法手动改动。</p>
    {loading ? <p className="text-sm text-ink/50">正在读取分组成员…</p> : null}{error ? <p className="text-sm font-bold text-coral">{error}</p> : null}
    {data ? <div className="divide-y divide-line rounded-xl border border-line bg-white">{data.list.length ? data.list.map((member) => <div className="flex items-center gap-3 p-3" key={member.needoId}><img alt="" className="h-9 w-9 rounded-full object-cover" src={member.avatarUrl || "/images/generated/profiles/profile-03.jpg"} /><div><p className="text-sm font-bold">{member.username}</p><p className="text-xs text-ink/45">{member.needoId} · {member.email}</p></div></div>) : <p className="p-6 text-center text-sm text-ink/45">暂无成员</p>}</div> : null}
    {data && totalPages > 1 ? <div className="mt-3 flex justify-end gap-2 text-xs"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="secondary">上一页</Button><span className="self-center">{page} / {totalPages}</span><Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">下一页</Button></div> : null}
    {editable ? <section className="mt-6 rounded-xl border border-line bg-paper p-4"><h3 className="font-black">批量维护成员</h3><p className="mt-1 text-xs text-ink/50">每行一个 NeeDo ID；保存后以该完整名单为准。</p><textarea className="mt-3 min-h-40 w-full rounded-lg border border-line bg-white p-3 font-mono text-sm outline-none focus:border-moss" onChange={(event) => setMemberIds(event.target.value)} value={memberIds} /><label className="mt-3 block text-sm font-bold">变更原因<textarea className="mt-2 min-h-20 w-full rounded-lg border border-line bg-white p-3 outline-none" onChange={(event) => setReason(event.target.value)} value={reason} /></label><Button className="mt-3" disabled={saving || !reason.trim()} onClick={() => void save()}>{saving ? "保存中…" : "保存成员变更"}</Button></section> : null}
  </Drawer>;
}
