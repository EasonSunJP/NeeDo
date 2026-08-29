import { useEffect, useState } from "react";
import {
  affiliateMarketplaceApi,
  type AffiliateMarketplaceTaskPage
} from "../../api/affiliateMarketplace";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { AffiliateTaskCard } from "./AffiliateTaskCard";

export function AffiliateMarketplaceSection({
  keyword,
  page = 1,
  pageSize = 6,
  onPageChange,
  showHeading = true
}: {
  keyword?: string;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  showHeading?: boolean;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [response, setResponse] = useState<AffiliateMarketplaceTaskPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    void affiliateMarketplaceApi
      .listTasks({
        ...(keyword?.trim() ? { keyword: keyword.trim() } : {}),
        page,
        pageSize,
        signal: controller.signal
      })
      .then((nextResponse) => {
        if (!controller.signal.aborted) setResponse(nextResponse);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [keyword, page, pageSize, requestVersion]);

  const totalPages = response ? Math.max(1, Math.ceil(response.total / response.page_size)) : 1;

  return (
    <section aria-busy={loading} aria-live="polite" className="space-y-4">
      {showHeading ? (
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[color:var(--client-primary)]">
              Affiliate marketplace
            </p>
            <h1 className="mt-1 text-2xl font-black text-[color:var(--client-text)]">
              {t("推荐任务")}
            </h1>
          </div>
          {response ? (
            <span className="text-xs font-black text-[color:var(--client-muted)]">
              {t("共 {count} 个任务").replace("{count}", String(response.total))}
            </span>
          ) : null}
        </div>
      ) : response ? (
        <p className="px-1 text-xs font-black text-[color:var(--client-muted)]">
          {t("共 {count} 个任务").replace("{count}", String(response.total))}
        </p>
      ) : null}

      {loading ? (
        <div
          className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center text-sm font-black text-[color:var(--client-muted)]"
          data-testid="affiliate-marketplace-loading"
        >
          {t("正在读取推荐任务")}
        </div>
      ) : error ? (
        <div className="rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6 text-center">
          <p className="text-sm font-black text-[color:var(--client-text)]">
            {t("推荐任务读取失败")}
          </p>
          <button
            className="mt-4 min-h-11 rounded-full bg-[color:var(--client-primary)] px-6 text-sm font-black text-[#07100b]"
            onClick={() => setRequestVersion((value) => value + 1)}
            type="button"
          >
            {t("重试")}
          </button>
        </div>
      ) : response?.list.length ? (
        <div className="space-y-4">
          {response.list.map((task) => (
            <AffiliateTaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <div className="rounded-[26px] border border-dashed border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-7 text-center">
          <p className="text-sm font-black text-[color:var(--client-text)]">
            {t("暂无符合条件的任务")}
          </p>
          <p className="mt-2 text-xs font-semibold text-[color:var(--client-muted)]">
            {t("调整搜索词后再试，新的正式任务也会显示在这里。")}
          </p>
        </div>
      )}

      {onPageChange && response && response.total > response.page_size ? (
        <nav aria-label={t("任务分页")} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button
            className="min-h-11 rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-35"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            type="button"
          >
            {t("上一页")}
          </button>
          <span className="text-xs font-black text-[color:var(--client-muted)]">
            {page} / {totalPages}
          </span>
          <button
            className="min-h-11 rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-35"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            type="button"
          >
            {t("下一页")}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
