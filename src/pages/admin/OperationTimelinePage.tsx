import { useEffect, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { AdminEventTimeline } from "../../components/admin/AdminEventTimeline";
import {
  FormalTimelinePagination,
  type FormalTimelinePageSize,
} from "../../components/admin/FormalTimelinePagination";
import {
  releasePublicationsApi,
  type ReleasePublicationPage,
} from "../../api/releasePublications";
import { useI18n } from "../../i18n/I18nProvider";
import { releaseText } from "../../features/dashboard/releaseTranslations";

export function OperationTimelinePage() {
  const { language } = useI18n();
  const t = (source: string) => releaseText(source, language);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<FormalTimelinePageSize>(10);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ReleasePublicationPage | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setData(null);
    void releasePublicationsApi
      .list(page, pageSize, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setStatus("success");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [page, pageSize, revision]);
  const dateFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const kinds = {
    release: "发布",
    rollback: "回滚",
    baseline: "首次记录",
    redeploy: "重新发布",
  };
  return (
    <AdminLayout>
      <ModuleShell
        actions={<></>}
        title={t("运营时间线")}
        description={t("按实际发布时间记录每个版本的更新内容。")}
      >
        {status === "loading" ? (
          <p role="status">{t("正在加载版本记录")}</p>
        ) : null}
        {status === "error" ? (
          <div
            role="alert"
            className="rounded-2xl border border-line bg-white p-5 text-coral"
          >
            <p>{t("版本记录加载失败")}</p>
            <button
              className="mt-3 rounded-full border border-line px-4 py-2 text-ink"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("重试")}
            </button>
          </div>
        ) : null}
        {status === "success" && data ? (
          <>
            <AdminEventTimeline
              title={t("版本发布记录")}
              showCommentComposer={false}
              emptyLabel={t("尚无版本发布记录，部署成功后会自动记录。")}
              events={data.list.map((release) => ({
                id: String(release.id),
                title: t(kinds[release.kind]),
                tone: "accent" as const,
                icon: <span aria-hidden="true">↥</span>,
                atLabel: (
                  <time
                    title={t("发布时间（东京）")}
                    dateTime={release.publishedAt}
                    data-no-i18n
                    className="whitespace-pre-line"
                  >
                    {dateFormat
                      .format(new Date(release.publishedAt))
                      .replace(" ", "\n")}
                  </time>
                ),
                preserveAtLabel: true,
                actorName: (
                  <span data-no-i18n>
                    {t("版本")} {release.version}
                  </span>
                ),
                actorRole: t(kinds[release.kind]),
                message: (
                  <span className="whitespace-pre-line" data-no-i18n>
                    {"\n" +
                      release.changes.map((change) => `• ${change}`).join("\n")}
                  </span>
                ),
              }))}
            />
            <FormalTimelinePagination
              ariaLabel={t("版本发布记录")}
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        ) : null}
      </ModuleShell>
    </AdminLayout>
  );
}
