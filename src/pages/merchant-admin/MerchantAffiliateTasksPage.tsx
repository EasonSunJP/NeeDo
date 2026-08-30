import { useEffect, useState } from "react";
import {
  merchantAffiliateTasksApi,
  type MerchantAffiliatePublisherType,
  type MerchantAffiliateTask,
  type MerchantAffiliateTaskStatus
} from "../../api/merchantAffiliateTasks";
import type { Language } from "../../i18n/translations";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { MerchantAdminLayout } from "../../components/merchant-admin/MerchantAdminLayout";
import { Button } from "../../components/ui/Button";
import { MerchantAffiliateTaskTable } from "../../features/merchant-affiliate-task/MerchantAffiliateTaskTable";
import { useI18n } from "../../i18n/I18nProvider";
import {
  describeMerchantAffiliateTaskError,
  getMerchantAffiliateTaskCopy
} from "./merchantAffiliateTaskCopy";

const pageSize = 20;

type LoadStatus = "loading" | "success" | "error";

export const describeMerchantAffiliateTaskListError = (
  error: unknown,
  language: Language
): string => describeMerchantAffiliateTaskError(error, language);

export function MerchantAffiliateTasksContent({
  initialPage = 1,
  onCreateTask,
  onSelectTask
}: {
  initialPage?: number;
  onCreateTask?: () => void;
  onSelectTask?: (taskId: number) => void;
}) {
  const { language } = useI18n();
  const copy = getMerchantAffiliateTaskCopy(language);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<MerchantAffiliateTaskStatus | "">("");
  const [publisherType, setPublisherType] = useState<MerchantAffiliatePublisherType | "">("");
  const [page, setPage] = useState(initialPage);
  const [rows, setRows] = useState<MerchantAffiliateTask[]>([]);
  const [total, setTotal] = useState(0);
  const [responsePageSize, setResponsePageSize] = useState(pageSize);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoadStatus("loading");
    setLoadError("");
    merchantAffiliateTasksApi
      .listTasks({
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
        status: status || undefined,
        publisherType: publisherType || undefined
      })
      .then((result) => {
        if (cancelled) return;
        setRows(result.list);
        setTotal(result.total);
        setResponsePageSize(result.page_size);
        setLoadStatus("success");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setResponsePageSize(pageSize);
        setLoadError(describeMerchantAffiliateTaskListError(error, language));
        setLoadStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [keyword, language, page, publisherType, revision, status]);

  const totalPages = Math.max(1, Math.ceil(total / responsePageSize));
  const changeKeyword = (value: string) => {
    setKeyword(value);
    setPage(1);
  };
  const changeStatus = (value: MerchantAffiliateTaskStatus | "") => {
    setStatus(value);
    setPage(1);
  };
  const changePublisher = (value: MerchantAffiliatePublisherType | "") => {
    setPublisherType(value);
    setPage(1);
  };

  return (
    <ModuleShell
      actions={<Button onClick={onCreateTask}>{copy.createTask}</Button>}
      description={copy.description}
      title={copy.title}
    >
      <section className="rounded-xl border border-line bg-white p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_220px_220px]">
          <label className="text-xs font-black text-ink/55">
            {copy.taskCode}
            <input
              className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink outline-none"
              data-filter="keyword"
              onChange={(event) => changeKeyword(event.target.value)}
              placeholder={copy.searchPlaceholder}
              value={keyword}
            />
          </label>
          <label className="text-xs font-black text-ink/55">
            {copy.status}
            <select
              className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink outline-none"
              data-filter="status"
              onChange={(event) => changeStatus(event.target.value as MerchantAffiliateTaskStatus | "")}
              value={status}
            >
              <option value="">{copy.allStatuses}</option>
              {Object.entries(copy.statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-ink/55">
            {copy.publisher}
            <select
              className="focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink outline-none"
              data-filter="publisher"
              onChange={(event) => changePublisher(event.target.value as MerchantAffiliatePublisherType | "")}
              value={publisherType}
            >
              <option value="">{copy.allPublishers}</option>
              <option value="shop">{copy.shopPublisher}</option>
              <option value="merchant_account">{copy.merchantPublisher}</option>
            </select>
          </label>
        </div>
      </section>

      {loadStatus === "loading" ? (
        <section
          aria-live="polite"
          className="rounded-xl border border-line bg-white px-5 py-12 text-center shadow-panel"
        >
          <p className="text-sm font-black text-ink">{copy.loading}</p>
        </section>
      ) : null}

      {loadStatus === "error" ? (
        <section
          className="rounded-xl border border-coral/30 bg-coral/5 px-5 py-10 text-center shadow-panel"
          role="alert"
        >
          <h2 className="font-black text-ink">{copy.loadFailed}</h2>
          <p className="mt-2 text-sm font-bold text-ink/55">{loadError}</p>
          <Button
            className="mt-4"
            data-action="retry-affiliate-tasks"
            onClick={() => setRevision((current) => current + 1)}
          >
            {copy.retry}
          </Button>
        </section>
      ) : null}

      {loadStatus === "success" && rows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-line bg-white px-5 py-12 text-center shadow-panel">
          <p className="text-sm font-black text-ink/55">{copy.empty}</p>
        </section>
      ) : null}

      {loadStatus === "success" && rows.length > 0 ? (
        <MerchantAffiliateTaskTable
          copy={copy}
          onSelect={(taskId) => onSelectTask?.(taskId)}
          rows={rows}
        />
      ) : null}

      {loadStatus === "success" ? (
        <nav
          aria-label={copy.pageLabel(page, totalPages)}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-panel"
        >
          <Button
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            variant="secondary"
          >
            {copy.previousPage}
          </Button>
          <span className="text-sm font-black text-ink/60">{copy.pageLabel(page, totalPages)}</span>
          <Button
            disabled={page >= totalPages}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            variant="secondary"
          >
            {copy.nextPage}
          </Button>
        </nav>
      ) : null}
    </ModuleShell>
  );
}

export function MerchantAffiliateTasksPage() {
  return (
    <MerchantAdminLayout>
      <MerchantAffiliateTasksContent />
    </MerchantAdminLayout>
  );
}
