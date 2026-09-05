import { useEffect, useState } from "react";
import { platformPartnersApi, type PartnerType } from "../../api/platformPartners";
import { FormalManagedUserDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type { PlatformManagedUserDetail, UserDirectoryScope } from "./types";

type DetailState = {
  loading: boolean;
  error: string | null;
  user: PlatformManagedUserDetail | null;
};

export function UnifiedUserDetailDrawer({
  scope,
  userId,
  onClose
}: {
  scope: UserDirectoryScope;
  userId: number | null;
  onClose: () => void;
}) {
  const { language } = useOptionalI18n();
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<DetailState>({ loading: false, error: null, user: null });

  useEffect(() => {
    if (userId === null) {
      setState({ loading: false, error: null, user: null });
      return;
    }
    let active = true;
    setState({ loading: true, error: null, user: null });
    platformUserManagementApi.getUser(scope, userId)
      .then((user) => active && setState({ loading: false, error: null, user }))
      .catch(() => active && setState({ loading: false, error: translateText("用户详细信息读取失败", language), user: null }));
    return () => { active = false; };
  }, [language, reloadToken, scope, userId]);

  const user = state.user;
  return (
    <Drawer
      defaultWidth={920}
      maxWidth={1180}
      onClose={onClose}
      open={userId !== null}
      title={user ? `${user.displayName} · ${user.needoId}` : translateText("用户详细信息", language)}
      widthStorageKey="needo.ui.drawer.unified-user-detail.width"
    >
      {state.loading ? <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/50">{translateText("正在读取用户详细信息...", language)}</p> : null}
      {!state.loading && state.error ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><span>{state.error}</span><Button onClick={() => setReloadToken((value) => value + 1)} size="sm" variant="secondary">{translateText("重试", language)}</Button></div> : null}
      {!state.loading && !state.error && user ? <div className="space-y-4">
        <FormalManagedUserDetailPanel detail={user} />
        {scope === "operations" && user.capabilities.partnerWrite ? <PartnerMarkerEditor userId={user.id} /> : null}
      </div> : null}
    </Drawer>
  );
}

function PartnerMarkerEditor({ userId }: { userId: number }) {
  const { language } = useOptionalI18n();
  const now = new Date();
  const [activatedAt, setActivatedAt] = useState(new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<PartnerType | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const save = async (partnerType: PartnerType) => {
    if (!activatedAt || !reason.trim()) {
      setError(translateText("请填写生效时间和标记理由", language));
      return;
    }
    setSaving(partnerType);
    setNotice("");
    setError("");
    try {
      await platformPartnersApi.markPartnerProfile(userId, {
        partnerType,
        activatedAt: new Date(activatedAt).toISOString(),
        reason: reason.trim()
      });
      setNotice(translateText("合作方标记已保存", language));
      setReason("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : translateText("合作方标记保存失败", language));
    } finally {
      setSaving(null);
    }
  };

  return <section className="rounded-[18px] border border-line bg-white p-4 shadow-panel sm:p-5">
    <h3 className="border-l-[3px] border-moss pl-3 text-base font-black">{translateText("平台合作方标记", language)}</h3>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-bold text-ink/55">{translateText("生效时间", language)}<input className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm" onChange={(event) => setActivatedAt(event.target.value)} type="datetime-local" value={activatedAt} /></label>
      <label className="text-xs font-bold text-ink/55">{translateText("标记理由", language)}<input className="mt-1 h-10 w-full rounded-lg border border-line bg-paper px-3 text-sm" onChange={(event) => setReason(event.target.value)} value={reason} /></label>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      {(["agent", "franchisee", "supplier"] as const).map((type) => <Button disabled={saving !== null} key={type} onClick={() => void save(type)} size="sm" variant={type === "agent" ? "primary" : "secondary"}>{translateText(type === "agent" ? "标记为代理商" : type === "franchisee" ? "标记为加盟商" : "标记为供货商", language)}</Button>)}
    </div>
    {notice ? <p className="mt-3 text-sm font-bold text-emerald-700">{notice}</p> : null}
    {error ? <p className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
  </section>;
}
