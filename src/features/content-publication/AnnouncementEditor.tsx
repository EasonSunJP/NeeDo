import { useCallback, useEffect, useState } from "react";
import {
  contentPublicationApi,
  type AnnouncementPreview,
  type AnnouncementRelease,
  type ContentLocaleCode,
} from "../../api/contentPublication";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { contentPublicationEditorText } from "./i18n";
import {
  contentEditorLocaleLabels,
  contentEditorLocales,
} from "./LocalizedCarouselEditor";

const inputClass =
  "focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none disabled:bg-paper disabled:text-ink/45";
const areaClass =
  "focus-ring min-h-28 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none disabled:bg-paper disabled:text-ink/45";

function operationKey() {
  return globalThis.crypto.randomUUID();
}

export function AnnouncementEditor({
  readPermission = "page:backoffice-affiliate-announcement",
  editPermission = "button:backoffice-affiliate-announcement-edit",
  publishPermission = "button:backoffice-affiliate-announcement-publish",
}: {
  readPermission?: string;
  editPermission?: string;
  publishPermission?: string;
}) {
  const { language } = useOptionalI18n();
  const t = useCallback(
    (key: Parameters<typeof contentPublicationEditorText>[0]) =>
      contentPublicationEditorText(key, language),
    [language],
  );
  const [list, setList] = useState<AnnouncementRelease[]>([]);
  const [selected, setSelected] = useState<AnnouncementRelease | null>(null);
  const [history, setHistory] = useState<AnnouncementRelease[]>([]);
  const [locale, setLocale] = useState<ContentLocaleCode>("zh-CN");
  const [load, setLoad] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [reason, setReason] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [rollbackReleaseId, setRollbackReleaseId] = useState("");
  const [dirtyLocales, setDirtyLocales] = useState<Set<ContentLocaleCode>>(
    () => new Set(),
  );
  const [conflict, setConflict] = useState(false);
  const [preview, setPreview] = useState<AnnouncementPreview | null>(null);

  const loadList = useCallback(async () => {
    setLoad("loading");
    setError("");
    try {
      const response = await contentPublicationApi.listAnnouncements({
        page: 1,
        pageSize: 20,
      });
      setList(response.list);
      const next = response.list[0] ?? null;
      setSelected(next);
      if (next) {
        const releases = await contentPublicationApi.getAnnouncementHistory(
          next.publicId,
          { page: 1, pageSize: 20 },
        );
        setHistory(releases.list);
        const source = releases.list.find((item) => item.status !== "draft");
        setRollbackReleaseId(source ? String(source.releaseId) : "");
      } else {
        setHistory([]);
        setRollbackReleaseId("");
      }
      setLoad("ready");
      setDirtyLocales(new Set());
      setConflict(false);
    } catch {
      setLoad("error");
      setError(t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function selectAnnouncement(item: AnnouncementRelease) {
    setSelected(item);
    setDirtyLocales(new Set());
    setError("");
    try {
      const response = await contentPublicationApi.getAnnouncementHistory(
        item.publicId,
        { page: 1, pageSize: 20 },
      );
      setHistory(response.list);
      const source = response.list.find((release) => release.status !== "draft");
      setRollbackReleaseId(source ? String(source.releaseId) : "");
    } catch {
      setHistory([]);
      setError(t("loadError"));
    }
  }

  function replaceSelected(next: AnnouncementRelease) {
    setSelected(next);
    setList((current) =>
      current.map((item) => (item.publicId === next.publicId ? next : item)),
    );
    setError("");
  }

  const draft = selected?.status === "draft" ? selected : null;
  const latestVersion = Math.max(
    selected?.version ?? 0,
    ...history.map((item) => item.version),
  );

  async function createDraft() {
    if (!newTitle.trim() || !newBody.trim()) return;
    try {
      await contentPublicationApi.createAnnouncementDraft({
        idempotencyKey: operationKey(),
        sourceLocale: locale,
        affiliateTaskId: null,
        visibleFrom: null,
        visibleUntil: null,
        translation: {
          title: newTitle.trim(),
          summary: null,
          body: newBody.trim(),
        },
      });
      await loadList();
      setNewTitle("");
      setNewBody("");
      setDirtyLocales(new Set());
      setNotice(t("saved"));
    } catch {
      setError(t("failedSave"));
    }
  }

  async function saveLocale(): Promise<AnnouncementRelease | null> {
    if (!draft) return null;
    if (dirtyLocales.size === 0) return draft;
    try {
      let saved = draft;
      for (const dirtyLocale of dirtyLocales) {
        const value = draft.translations[dirtyLocale];
        saved = await contentPublicationApi.updateAnnouncementLocale(
          draft.publicId,
          draft.releaseId,
          {
            expectedLockVersion: saved.lockVersion,
            locale: dirtyLocale,
            title: value.title,
            summary: value.summary,
            body: value.body,
          },
        );
      }
      replaceSelected(saved);
      setDirtyLocales(new Set());
      setConflict(false);
      setNotice(t("saved"));
      return saved;
    } catch (caught) {
      const isConflict = caught instanceof ApiClientError && caught.status === 409;
      setConflict(isConflict);
      setError(
        isConflict ? t("conflict") : t("failedSave"),
      );
      return null;
    }
  }

  function updateTranslation(
    field: "title" | "summary" | "body",
    value: string,
  ) {
    if (!draft) return;
    replaceSelected({
      ...draft,
      translations: {
        ...draft.translations,
        [locale]: {
          ...draft.translations[locale],
          [field]: field === "summary" ? value || null : value,
          sourceLocale: locale,
          isInitialCopy: false,
        },
      },
    });
    setDirtyLocales((current) => {
      const next = new Set(current);
      next.add(locale);
      return next;
    });
    setNotice("");
  }

  async function copyLocale() {
    if (!draft || !window.confirm(t("copyConfirm"))) return;
    const savedDraft = dirtyLocales.size > 0 ? await saveLocale() : draft;
    if (!savedDraft) return;
    try {
      replaceSelected(
        await contentPublicationApi.copyAnnouncementLocaleToAll(
          savedDraft.publicId,
          savedDraft.releaseId,
          {
            expectedLockVersion: savedDraft.lockVersion,
            sourceLocale: locale,
          },
        ),
      );
      setDirtyLocales(new Set());
    } catch (caught) {
      const isConflict = caught instanceof ApiClientError && caught.status === 409;
      setConflict(isConflict);
      setError(
        isConflict ? t("conflict") : t("failedSave"),
      );
    }
  }

  async function lifecycle(operation: () => Promise<AnnouncementRelease>) {
    try {
      await operation();
      await loadList();
      setNotice(t("saved"));
    } catch (caught) {
      const isConflict = caught instanceof ApiClientError && caught.status === 409;
      setConflict(isConflict);
      setError(
        isConflict ? t("conflict") : t("failedSave"),
      );
    }
  }

  async function ensureSaved() {
    return dirtyLocales.size > 0 ? saveLocale() : draft;
  }

  async function previewDraft() {
    const saved = await ensureSaved();
    if (!saved) return;
    try {
      setPreview(
        await contentPublicationApi.previewAnnouncement(
          saved.publicId,
          saved.releaseId,
        ),
      );
    } catch {
      setError(t("loadError"));
    }
  }

  return (
    <PermissionGate
      fallback={
        <p className="rounded-lg border border-coral/30 bg-coral/10 p-4 text-sm font-bold text-[#9b352a]">
          403 · {t("editDenied")}
        </p>
      }
      permission={readPermission}
    >
      <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">
              {t("affiliateContent")}
            </p>
            <h2 className="mt-1 text-xl font-black text-ink">
              {t("announcementEditor")}
            </h2>
          </div>
          {selected ? (
            <Badge
              tone={
                selected.status === "published"
                  ? "green"
                  : selected.status === "scheduled"
                    ? "blue"
                    : "yellow"
              }
            >
              {selected.status} · v{selected.version}
            </Badge>
          ) : null}
        </div>
        {error ? (
          <p
            className="mt-4 rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-bold text-[#9b352a]"
            role="alert"
          >
            {error}
            {conflict ? (
              <Button
                className="ml-3"
                onClick={() => void loadList()}
                size="sm"
                variant="secondary"
              >
                {t("reload")}
              </Button>
            ) : null}
          </p>
        ) : null}
        {notice ? (
          <p
            className="mt-4 rounded-lg border border-mint bg-mint/10 px-4 py-3 text-sm font-bold"
            role="status"
          >
            {notice}
          </p>
        ) : null}
        {load === "loading" ? (
          <p className="mt-4 text-sm font-bold text-ink/50">{t("loading")}</p>
        ) : null}
        {load === "error" ? (
          <Button
            className="mt-3"
            onClick={() => void loadList()}
            size="sm"
            variant="secondary"
          >
            {t("reload")}
          </Button>
        ) : null}

        <PermissionGate permission={editPermission}>
          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-[1fr_1.5fr_auto]">
            <input
              className={inputClass}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder={t("title")}
              value={newTitle}
            />
            <input
              className={inputClass}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder={t("announcementBody")}
              value={newBody}
            />
            <Button
              disabled={!newTitle.trim() || !newBody.trim()}
              onClick={() => void createDraft()}
            >
              {t("createAnnouncement")}
            </Button>
          </div>
        </PermissionGate>

        {list.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {list.map((item) => (
              <button
                className={`focus-ring rounded-full border px-3 py-2 text-xs font-bold ${item.publicId === selected?.publicId ? "border-moss bg-mint/10 text-moss" : "border-line bg-white text-ink/60"}`}
                key={`${item.publicId}-${item.releaseId}`}
                onClick={() => void selectAnnouncement(item)}
                type="button"
              >
                {item.translations[locale].title}
              </button>
            ))}
          </div>
        ) : null}

        {selected ? (
          <>
            <div
              className="mt-4 flex overflow-x-auto border-b border-line"
              role="tablist"
            >
              {contentEditorLocales.map((item) => (
                <button
                  aria-selected={item === locale}
                  className={`focus-ring shrink-0 border-b-2 px-4 py-3 text-sm font-black ${item === locale ? "border-moss text-moss" : "border-transparent text-ink/45"}`}
                  key={item}
                  onClick={() => setLocale(item)}
                  role="tab"
                  type="button"
                >
                  {contentEditorLocaleLabels[item]}
                </button>
              ))}
            </div>
            {selected.translations[locale].isInitialCopy ? (
              <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs font-bold text-yellow-900">
                {t("initialCopy").replace(
                  "{locale}",
                  contentEditorLocaleLabels[
                    selected.translations[locale].sourceLocale
                  ],
                )}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end">
              <Button
                onClick={() =>
                  void (draft
                    ? previewDraft()
                    : contentPublicationApi
                        .previewAnnouncement(
                          selected.publicId,
                          selected.releaseId,
                        )
                        .then(setPreview)
                        .catch(() => setError(t("loadError"))))
                }
                variant="secondary"
              >
                {t("preview")}
              </Button>
            </div>
            {draft ? (
              <>
                <PermissionGate
                  fallback={<Badge className="mt-4">{t("editDenied")}</Badge>}
                  permission={editPermission}
                >
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-black">
                      {t("title")}
                      <input
                        className={`${inputClass} mt-2`}
                        name="announcementTitle"
                        onChange={(event) =>
                          updateTranslation("title", event.target.value)
                        }
                        value={draft.translations[locale].title}
                      />
                    </label>
                    <label className="text-sm font-black">
                      {t("announcementSummary")}
                      <input
                        className={`${inputClass} mt-2`}
                        name="announcementSummary"
                        onChange={(event) =>
                          updateTranslation("summary", event.target.value)
                        }
                        value={draft.translations[locale].summary ?? ""}
                      />
                    </label>
                    <label className="text-sm font-black md:col-span-2">
                      {t("announcementBody")}
                      <textarea
                        className={`${areaClass} mt-2`}
                        name="announcementBody"
                        onChange={(event) =>
                          updateTranslation("body", event.target.value)
                        }
                        value={draft.translations[locale].body}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                      <Button onClick={() => void saveLocale()}>
                        {t("save")}
                      </Button>
                      <Button
                        onClick={() => void copyLocale()}
                        variant="secondary"
                      >
                        {t("copy")}
                      </Button>
                    </div>
                  </div>
                </PermissionGate>
                <PermissionGate permission={publishPermission}>
                  <div className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-3">
                    <Button
                      onClick={() =>
                        void (async () => {
                          const saved = await ensureSaved();
                          if (!saved) return;
                          await lifecycle(() =>
                            contentPublicationApi.publishAnnouncement(
                              saved.publicId,
                              saved.releaseId,
                              {
                                idempotencyKey: operationKey(),
                                expectedLockVersion: saved.lockVersion,
                              },
                            ),
                          );
                        })()
                      }
                    >
                      {t("publish")}
                    </Button>
                    <input
                      aria-label={t("publishAt")}
                      className={inputClass}
                      onChange={(event) => setPublishAt(event.target.value)}
                      type="datetime-local"
                      value={publishAt}
                    />
                    <Button
                      disabled={!publishAt}
                      onClick={() =>
                        void (async () => {
                          const saved = await ensureSaved();
                          if (!saved) return;
                          await lifecycle(() =>
                            contentPublicationApi.scheduleAnnouncement(
                              saved.publicId,
                              saved.releaseId,
                              {
                                idempotencyKey: operationKey(),
                                expectedLockVersion: saved.lockVersion,
                                publishAt: new Date(publishAt).toISOString(),
                              },
                            ),
                          );
                        })()
                      }
                      variant="secondary"
                    >
                      {t("schedule")}
                    </Button>
                  </div>
                </PermissionGate>
              </>
            ) : (
              <PermissionGate permission={publishPermission}>
                <div className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-3">
                  <h3 className="text-sm font-black lg:col-span-3">
                    {t("cloneFromHistory")}
                  </h3>
                  <select
                    className={inputClass}
                    name="announcementRollbackReleaseId"
                    onChange={(event) =>
                      setRollbackReleaseId(event.target.value)
                    }
                    value={rollbackReleaseId}
                  >
                    {history
                      .filter((item) => item.status !== "draft")
                      .map((item) => (
                        <option key={item.releaseId} value={item.releaseId}>
                          {item.status} · v{item.version}
                        </option>
                      ))}
                  </select>
                  <input
                    className={inputClass}
                    name="announcementRollbackReason"
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={t("cloneReason")}
                    value={reason}
                  />
                  <Button
                    disabled={!rollbackReleaseId || !reason.trim()}
                    onClick={() =>
                      void lifecycle(() =>
                        contentPublicationApi.rollbackAnnouncement(
                          selected.publicId,
                          Number(rollbackReleaseId),
                          {
                            idempotencyKey: operationKey(),
                            expectedCurrentVersion: latestVersion,
                            reason: reason.trim(),
                          },
                        ),
                      )
                    }
                  >
                    {t("createNewDraft")}
                  </Button>
                </div>
              </PermissionGate>
            )}
            {selected.status === "published" ||
            selected.status === "scheduled" ? (
              <PermissionGate permission={publishPermission}>
                <div className="mt-4 grid gap-3 rounded-lg border border-line bg-white p-4 md:grid-cols-[1fr_auto]">
                  <input
                    aria-label={t("disableReason")}
                    className={inputClass}
                    name="announcementDisableReason"
                    onChange={(event) => setDisableReason(event.target.value)}
                    value={disableReason}
                  />
                  <Button
                    disabled={!disableReason.trim()}
                    onClick={() =>
                      void lifecycle(() =>
                        contentPublicationApi.disableAnnouncement(
                          selected.publicId,
                          selected.releaseId,
                          {
                            idempotencyKey: operationKey(),
                            expectedLockVersion: selected.lockVersion,
                            reason: disableReason.trim(),
                          },
                        ),
                      )
                    }
                    variant="danger"
                  >
                    {t("disable")}
                  </Button>
                </div>
              </PermissionGate>
            ) : null}
          </>
        ) : null}
        {preview ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5"
            role="dialog"
          >
            <article className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-black text-ink">
                  {preview.translations[locale].title}
                </h3>
                <Button
                  onClick={() => setPreview(null)}
                  size="sm"
                  variant="secondary"
                >
                  {t("closePreview")}
                </Button>
              </div>
              {preview.translations[locale].summary ? (
                <p className="mt-4 text-sm font-bold text-ink/60">
                  {preview.translations[locale].summary}
                </p>
              ) : null}
              <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-7 text-ink">
                {preview.translations[locale].body}
              </p>
            </article>
          </div>
        ) : null}
      </section>
    </PermissionGate>
  );
}
