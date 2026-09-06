import { useEffect, useState } from "react";
import { FormalManagedUserDetailPanel } from "../../components/admin/FormalProfileDetailPanels";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type { PlatformManagedUserDetail, UserDirectoryScope } from "./types";
import { UserMembershipAdjustmentDialog } from "./UserMembershipAdjustmentDialog";
import { UserReceivedReviews } from "./UserReceivedReviews";
import { UserUsageList } from "./UserUsageList";
import { PlatformPartnerRangeEditor } from "./PlatformPartnerRangeEditor";
import { ManagedUserActivity } from "./ManagedUserActivity";
import { PermissionTagDisclosure } from "./PermissionTagDisclosure";

type DetailState = {
  loading: boolean;
  error: string | null;
  user: PlatformManagedUserDetail | null;
};

export function UnifiedUserDetailDrawer({
  scope,
  userId,
  onClose,
  layer = "base"
}: {
  scope: UserDirectoryScope;
  userId: number | null;
  onClose: () => void;
  layer?: "base" | "overlay";
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
      layer={layer}
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
        <FormalManagedUserDetailPanel
          directoryScope={scope}
          detail={user}
          activityContent={<ManagedUserActivity key={`${scope}-${user.id}`} scope={scope} user={user} />}
          accountContent={<div className="space-y-4">
            <PermissionTagDisclosure roles={user.account.roles} />
            {scope === "operations" ? <PlatformPartnerRangeEditor canWrite={user.capabilities.partnerWrite} userId={user.id} /> : null}
          </div>}
          membershipActions={scope === "operations" && user.capabilities.membershipWrite ? {
            tier: <UserMembershipAdjustmentDialog currentValue={user.membership.tierCode} expectedLockVersion={user.membership.lockVersion} kind="tier" onSaved={() => setReloadToken((value) => value + 1)} userId={user.id} />,
            multiplier: <UserMembershipAdjustmentDialog currentValue={user.membership.experienceMultiplier} expectedLockVersion={user.membership.lockVersion} kind="multiplier" onSaved={() => setReloadToken((value) => value + 1)} userId={user.id} />
          } : undefined}
          reviewContent={<UserReceivedReviews canAmend={scope === "operations" && user.capabilities.reviewAmend} scope={scope} userId={user.id} />}
          usageContent={<UserUsageList canComment={scope === "operations" && user.capabilities.timelineCommentWrite} canRefundAmend={scope === "operations" && user.capabilities.refundAmend} scope={scope} userId={user.id} />}
        />
      </div> : null}
    </Drawer>
  );
}
