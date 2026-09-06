import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import { ManagedUserActivity } from "./ManagedUserActivity";
import type { AccountUserLogDetail, UserDirectoryScope } from "./types";

export function AccountUserLog({ scope, technicianId }: { scope: UserDirectoryScope; technicianId: number }) {
  const { language } = useOptionalI18n(); const t = (source: string) => translateText(source, language);
  const [user, setUser] = useState<AccountUserLogDetail | null>(null); const [error, setError] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setUser(null); setError(false);
    platformUserManagementApi.getTechnicianUserLog(scope, technicianId).then((detail) => { if (active) setUser(detail); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [scope, technicianId, revision]);
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-coral">{t("用户LOG读取失败，请重试")}<Button size="sm" variant="secondary" onClick={() => setRevision((value) => value + 1)}>{t("重试")}</Button></div>;
  if (!user) return <p className="p-4 text-sm text-ink/50">{t("正在读取用户LOG...")}</p>;
  return <ManagedUserActivity key={`${scope}-${technicianId}`} scope={scope} user={user} technicianId={technicianId} />;
}
