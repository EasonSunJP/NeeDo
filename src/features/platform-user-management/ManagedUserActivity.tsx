import { useEffect, useState } from "react";
import { AuditTimeline } from "../../components/admin/FormalProfileDetailPanels";
import { FormalTimelinePagination } from "../../components/admin/FormalTimelinePagination";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import { platformUserManagementApi } from "./api";
import type { PlatformManagedUserDetail, UserDirectoryScope } from "./types";

export function ManagedUserActivity({ scope, user }: { scope: UserDirectoryScope; user: PlatformManagedUserDetail }) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [audit, setAudit] = useState(user.audit);
  const [query, setQuery] = useState({ page: 1, pageSize: 10 as 10 | 50, revision: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (query.revision === 0) return;
    let active = true;
    setLoading(true);
    setError(false);
    platformUserManagementApi.getUser(scope, user.id, { audit_page: query.page, audit_page_size: query.pageSize })
      .then((detail) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(detail.audit.total / query.pageSize));
        if (query.page > lastPage) {
          setQuery((value) => ({ ...value, page: lastPage, revision: value.revision + 1 }));
          return;
        }
        setAudit(detail.audit);
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, user.id, query]);
  return <section aria-busy={loading} className="min-w-0 space-y-3">
    <FormalTimelinePagination ariaLabel="用户动态翻页" disabled={loading} page={audit.page ?? 1} pageSize={audit.page_size ?? 10} total={audit.total} pageSizes={[10, 50]}
      onPageChange={(page) => setQuery((value) => ({ ...value, page, pageSize: audit.page_size === 50 ? 50 : 10, revision: value.revision + 1 }))}
      onPageSizeChange={(pageSize) => { if (pageSize === 10 || pageSize === 50) setQuery((value) => ({ page: 1, pageSize, revision: value.revision + 1 })); }} />
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-coral"><span>{t("用户动态读取失败，请重试")}</span><Button size="sm" variant="secondary" onClick={() => setQuery((value) => ({ ...value, revision: value.revision + 1 }))}>{t("重试")}</Button></div> : null}
    <AuditTimeline events={audit.list.map((event) => ({ ...event, metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : null }))} localization={{ language, locale: languageLocales[language], t }} title="用户动态" />
  </section>;
}
