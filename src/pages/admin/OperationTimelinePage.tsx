import { useEffect, useState, type FormEvent } from "react";
import {
  releasePublicationsApi,
  type ReleasePublication,
  type ReleasePublicationFilters,
  type ReleasePublicationPage,
} from "../../api/releasePublications";
import { useAuth } from "../../auth/AuthProvider";
import { AdminEventTimeline } from "../../components/admin/AdminEventTimeline";
import { AdminLayout } from "../../components/admin/AdminLayout";
import {
  FormalTimelinePagination,
  type FormalTimelinePageSize,
} from "../../components/admin/FormalTimelinePagination";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { releaseText } from "../../features/dashboard/releaseTranslations";
import { useI18n } from "../../i18n/I18nProvider";

type EditorState = {
  release: ReleasePublication | null;
  version: string;
  publishedAt: string;
  sourceRevision: string;
  changes: string;
  reason: string;
};
const emptyEditor = (): EditorState => ({
  release: null,
  version: "",
  publishedAt: "",
  sourceRevision: "",
  changes: "",
  reason: "",
});
const inputClass =
  "focus-ring h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink outline-none";

export function OperationTimelinePage() {
  const { hasPermission } = useAuth();
  const { language } = useI18n();
  const t = (source: string) => releaseText(source, language);
  const canWrite = hasPermission("backoffice:releases:write");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<FormalTimelinePageSize>(10);
  const [revision, setRevision] = useState(0);
  const [draftFilters, setDraftFilters] = useState<ReleasePublicationFilters>(
    {},
  );
  const [filters, setFilters] = useState<ReleasePublicationFilters>({});
  const [filterError, setFilterError] = useState("");
  const [data, setData] = useState<ReleasePublicationPage | null>(null);
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void releasePublicationsApi
      .list(page, pageSize, filters, controller.signal)
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
  }, [filters, page, pageSize, revision]);
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
  const origins = {
    deployment: "自动记录",
    manual: "手动记录",
    backfill: "历史补录",
  };
  const openEdit = (release: ReleasePublication) => {
    setMutationError("");
    setEditor({
      release,
      version: release.version,
      publishedAt: "",
      sourceRevision: release.sourceRevision ?? "",
      changes: release.changes.join("\n"),
      reason: "",
    });
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor) return;
    const changes = editor.changes
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !editor.version.trim() ||
      !changes.length ||
      !editor.reason.trim() ||
      (!editor.release && !editor.publishedAt)
    ) {
      setMutationError(t("请填写所有必填项"));
      return;
    }
    if (
      editor.sourceRevision &&
      !/^[0-9a-f]{40}$/.test(editor.sourceRevision)
    ) {
      setMutationError(t("Git 提交必须是 40 位小写 SHA"));
      return;
    }
    setSaving(true);
    setMutationError("");
    try {
      if (editor.release)
        await releasePublicationsApi.edit(editor.release.id, {
          version: editor.version.trim(),
          changes,
          reason: editor.reason.trim(),
          expectedVersion: editor.release.lockVersion,
        });
      else
        await releasePublicationsApi.createManual({
          deploymentId: globalThis.crypto.randomUUID(),
          version: editor.version.trim(),
          sourceRevision: editor.sourceRevision || null,
          publishedAt: new Date(
            `${editor.publishedAt.length === 16 ? `${editor.publishedAt}:00` : editor.publishedAt}+09:00`,
          ).toISOString(),
          changes,
          reason: editor.reason.trim(),
        });
      setEditor(null);
      setPage(1);
      setRevision((value) => value + 1);
    } catch {
      setMutationError(t("保存失败，请刷新后重试"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <AdminLayout>
      <ModuleShell
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setMutationError("");
                setEditor(emptyEditor());
              }}
            >
              {t("手动添加")}
            </Button>
          ) : (
            <></>
          )
        }
        title={t("运营时间线")}
        description={t("按实际发布时间记录每个版本的更新内容。")}
      >
        <form
          className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              draftFilters.from &&
              draftFilters.to &&
              draftFilters.from > draftFilters.to
            ) {
              setFilterError(t("开始日期不能晚于结束日期"));
              return;
            }
            setFilterError("");
            setPage(1);
            setFilters(draftFilters);
          }}
        >
          <label className="grid gap-1 text-xs font-bold text-ink/60">
            <span>{t("开始日期")}</span>
            <input
              aria-label={t("开始日期")}
              className={inputClass}
              type="date"
              value={draftFilters.from ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  from: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-ink/60">
            <span>{t("结束日期")}</span>
            <input
              aria-label={t("结束日期")}
              className={inputClass}
              type="date"
              value={draftFilters.to ?? ""}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  to: event.target.value || undefined,
                }))
              }
            />
          </label>
          <Button type="submit">{t("搜索")}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setDraftFilters({});
              setFilters({});
              setFilterError("");
              setPage(1);
            }}
          >
            {t("重置")}
          </Button>
          {filterError ? (
            <p role="alert" className="w-full text-sm font-bold text-coral">
              {filterError}
            </p>
          ) : null}
        </form>
        {status === "loading" ? (
          <p role="status">{t("正在加载版本记录")}</p>
        ) : null}
        {status === "error" ? (
          <div
            role="alert"
            className="rounded-2xl border border-line bg-white p-5 text-coral"
          >
            <p>{t("版本记录加载失败")}</p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              {t("重试")}
            </Button>
          </div>
        ) : null}
        {status === "success" && data ? (
          <>
            <AdminEventTimeline
              title={t("版本发布记录")}
              showCommentComposer={false}
              emptyLabel={t("当前期间没有版本发布记录。")}
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
                actorRole: `${t(kinds[release.kind])} · ${t(origins[release.origin])}`,
                message: (
                  <span className="whitespace-pre-line" data-no-i18n>
                    {"\n" +
                      release.changes.map((change) => `• ${change}`).join("\n")}
                  </span>
                ),
                actions:
                  canWrite && release.origin !== "deployment" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEdit(release)}
                    >
                      {t("修改")}
                    </Button>
                  ) : undefined,
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
      <Drawer
        open={Boolean(editor)}
        title={editor?.release ? t("修改发布记录") : t("手动添加发布记录")}
        onClose={() => {
          if (!saving) setEditor(null);
        }}
        footer={
          editor ? (
            <div className="flex justify-end gap-2">
              <Button
                disabled={saving}
                variant="secondary"
                onClick={() => setEditor(null)}
              >
                {t("取消")}
              </Button>
              <Button disabled={saving} form="release-editor" type="submit">
                {saving ? t("保存中") : t("保存")}
              </Button>
            </div>
          ) : undefined
        }
      >
        {editor ? (
          <form
            className="grid gap-4"
            id="release-editor"
            onSubmit={(event) => void save(event)}
          >
            <label className="grid gap-2 text-sm font-bold">
              <span>{t("版本号")}</span>
              <input
                className={inputClass}
                maxLength={100}
                value={editor.version}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, version: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            {!editor.release ? (
              <>
                <label className="grid gap-2 text-sm font-bold">
                  <span>{t("发布时间（东京）")}</span>
                  <input
                    className={inputClass}
                    type="datetime-local"
                    value={editor.publishedAt}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? { ...current, publishedAt: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="grid gap-2 text-sm font-bold">
                  <span>{t("Git 提交（可选）")}</span>
                  <input
                    className={inputClass}
                    maxLength={40}
                    value={editor.sourceRevision}
                    onChange={(event) =>
                      setEditor((current) =>
                        current
                          ? {
                              ...current,
                              sourceRevision: event.target.value
                                .trim()
                                .toLowerCase(),
                            }
                          : current,
                      )
                    }
                  />
                </label>
              </>
            ) : (
              <p className="rounded-xl bg-mist p-3 text-xs font-semibold text-ink/60">
                {t("原始发布时间和发布证据会保留。")}
              </p>
            )}
            <label className="grid gap-2 text-sm font-bold">
              <span>{t("更新内容（每行一项）")}</span>
              <textarea
                className="focus-ring min-h-40 w-full rounded-xl border border-line bg-white p-3 text-sm font-semibold text-ink outline-none"
                value={editor.changes}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, changes: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="grid gap-2 text-sm font-bold">
              <span>{t("操作理由")}</span>
              <textarea
                className="focus-ring min-h-24 w-full rounded-xl border border-line bg-white p-3 text-sm font-semibold text-ink outline-none"
                maxLength={500}
                value={editor.reason}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, reason: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            {mutationError ? (
              <p role="alert" className="text-sm font-bold text-coral">
                {mutationError}
              </p>
            ) : null}
          </form>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
