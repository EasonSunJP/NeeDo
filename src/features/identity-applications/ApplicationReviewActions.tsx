import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { ApplicationBottomAction, ApplicationButton } from "./ApplicationUi";
import { identityApplicationsApi, type IdentityApplication } from "./api";

export function ApplicationReviewActions({ application, onError, onReapply, onWithdrawn }: {
  application: IdentityApplication;
  onError: (message: string) => void;
  onReapply: () => void;
  onWithdrawn: () => void;
}) {
  const { refreshSession } = useAuth();
  const { language } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const t = (source: string) => translateText(source, language);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); onError("");
    try { await operation(); }
    catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  return <ApplicationBottomAction>
    {application.status === "rejected" ? <ApplicationButton className="w-full" tone="danger" onClick={onReapply}>{t("审核未通过，再次申请")}</ApplicationButton>
      : application.status === "approved" ? <ApplicationButton className="w-full" disabled={busy} onClick={() => void run(async () => {
        const result = await refreshSession(application.type);
        if (!result.ok) { onError(result.message); return; }
        if (result.session.id !== application.userId || result.session.portal !== application.type) {
          onError("error.auth.operation_superseded"); return;
        }
        navigate(`/${application.type}`, { replace: true });
      })}>{t(application.type === "merchant" ? "切换为店铺身份" : "切换为技师身份")}</ApplicationButton>
      : <div className="flex gap-3"><ApplicationButton disabled={busy} tone="secondary" onClick={() => void run(async () => {
        await identityApplicationsApi.withdraw(application.id, application.version);
        const result = await refreshSession();
        if (!result.ok) { onError(result.message); return; }
        onWithdrawn();
      })}>{t("撤回")}</ApplicationButton><ApplicationButton className="min-w-0 flex-1" disabled>{t("审核中")}</ApplicationButton></div>}
  </ApplicationBottomAction>;
}
