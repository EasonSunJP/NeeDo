import { useEffect, useState, type FormEvent } from "react";
import { Drawer } from "../../components/ui/Drawer";
import { Button } from "../../components/ui/Button";
import { platformUserManagementApi } from "./api";
import type { UserGroup } from "./types";

export function UserGroupEditor({ group, open, onClose, onSaved }: { group: UserGroup | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setName(group?.name ?? ""); setDescription(group?.description ?? ""); setArchiveReason(""); setError(null); }, [group, open]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      if (group) await platformUserManagementApi.updateGroup(group.code, { name: name.trim(), description: description.trim() || null });
      else await platformUserManagementApi.createGroup({ name: name.trim(), description: description.trim() || null });
      onSaved(); onClose();
    } catch { setError("分组保存失败，请检查名称冲突或权限"); } finally { setSaving(false); }
  };

  const archive = async () => {
    if (!group || !archiveReason.trim()) return;
    setSaving(true); setError(null);
    try { await platformUserManagementApi.archiveGroup(group.code, archiveReason.trim()); onSaved(); onClose(); }
    catch { setError("分组归档失败"); } finally { setSaving(false); }
  };

  return <Drawer open={open} title={group ? "编辑自定义分组" : "新建自定义分组"} onClose={onClose} footer={<div className="flex justify-end gap-2"><Button onClick={onClose} variant="secondary">取消</Button><Button disabled={saving || !name.trim()} onClick={() => document.getElementById("user-group-editor-submit")?.click()}>{saving ? "保存中…" : "保存"}</Button></div>}>
    <form className="space-y-4" onSubmit={save}><label className="block text-sm font-bold">分组名称<input className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 outline-none focus:border-moss" maxLength={100} onChange={(event) => setName(event.target.value)} value={name} /></label><label className="block text-sm font-bold">分组简介<textarea className="mt-2 min-h-28 w-full rounded-lg border border-line bg-paper p-3 outline-none focus:border-moss" maxLength={500} onChange={(event) => setDescription(event.target.value)} value={description} /></label><button className="hidden" id="user-group-editor-submit" type="submit" />{error ? <p className="text-sm font-bold text-coral">{error}</p> : null}</form>
    {group ? <section className="mt-8 rounded-xl border border-coral/25 bg-coral/5 p-4"><h3 className="font-black text-coral">归档分组</h3><p className="mt-1 text-xs leading-5 text-ink/55">归档后停止使用此分组，并记录不可变审计原因。</p><textarea className="mt-3 min-h-20 w-full rounded-lg border border-line bg-white p-3 text-sm outline-none" onChange={(event) => setArchiveReason(event.target.value)} placeholder="归档原因（必填）" value={archiveReason} /><Button className="mt-3" disabled={saving || !archiveReason.trim()} onClick={() => void archive()} variant="danger">确认归档</Button></section> : null}
  </Drawer>;
}
