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
      setSelected(
        (current) =>
          response.list.find((item) => item.publicId === current?.publicId) ??
          response.list[0] ??
          null,
      );
      setLoad("ready");
    } catch {
      setLoad("error");
      setError(t("loadError"));
    }
  }, [t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      return;
    }
    let active = true;
    void contentPublicationApi
      .getAnnouncementHistory(selected.publicId, { page: 1, pageSize: 20 })
      .then((response) => {
        if (active) setHistory(response.list);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [selected?.publicId]);

  function replaceSelected(next: AnnouncementRelease) {
    setSelected(next);
    setList((current) =>
      current.map((item) => (item.publicId === next.publicId ? next : item)),
    );
    setError("");
  }

  async function createDraft() {
    if (!newTitle.trim() || !newBody.trim()) return;
    try {
      const created = await contentPublicationApi.createAnnouncementDraft({
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
      setList((current) => [created, ...current]);
      setSelected(created);
      setNewTitle("");
      setNewBody("");
      setNotice(t("saved"));
    } catch {
      setError(t("failedSave"));
    }
  }

  async function saveLocale() {
    if (!selected) return;
    try {
      replaceSelected(
        await contentPublicationApi.updateAnnouncementLocale(
          selected.publicId,
          selected.releaseId,
          {
            expectedLockVersion: selected.lockVersion,
            locale,
            ...selected.translations[locale],
          },
        ),
      );
      setNotice(t("saved"));
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 409
          ? t("conflict")
          : t("failedSave"),
      );
    }
  }

  function updateTranslation(
    field: "title" | "summary" | "body",
    value: string,
  ) {
    if (!selected) return;
    replaceSelected({
      ...selected,
      translations: {
        ...selected.translations,
        [locale]: {
          ...selected.translations[locale],
          [field]: field === "summary" ? value || null : value,
          sourceLocale: locale,
          isInitialCopy: false,
        },
      },
    });
    setNotice("");
  }

  async function copyLocale() {
    if (!selected || !window.confirm(t("copyConfirm"))) return;
    try {
      replaceSelected(
        await contentPublicationApi.copyAnnouncementLocaleToAll(
          selected.publicId,
          selected.releaseId,
          {
            expectedLockVersion: selected.lockVersion,
            sourceLocale: locale,
          },
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 409
          ? t("conflict")
          : t("failedSave"),
      );
    }
  }

  async function lifecycle(operation: () => Promise<AnnouncementRelease>) {
    try {
      replaceSelected(await operation());
      setNotice(t("saved"));
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 409
          ? t("conflict")
          : t("failedSave"),
      );
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
                onClick={() => setSelected(item)}
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
              onClick={async () => {
                try {
                  setPreview(
                    await contentPublicationApi.previewAnnouncement(
                      selected.publicId,
                      selected.releaseId,
                    ),
                  );
                } catch {
                  setError(t("loadError"));
                }
              }}
              variant="secondary"
            >
              {t("preview")}
            </Button>
          </div>
            <PermissionGate
              fallback={<Badge className="mt-4">{t("editDenied")}</Badge>}
              permission={editPermission}
            >
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-black">
                  {t("title")}
                  <input
                    className={`${inputClass} mt-2`}
                    onChange={(event) =>
                      updateTranslation("title", event.target.value)
                    }
                    value={selected.translations[locale].title}
                  />
                </label>
                <label className="text-sm font-black">
                  {t("announcementSummary")}
                  <input
                    className={`${inputClass} mt-2`}
                    onChange={(event) =>
                      updateTranslation("summary", event.target.value)
                    }
                    value={selected.translations[locale].summary ?? ""}
                  />
                </label>
                <label className="text-sm font-black md:col-span-2">
                  {t("announcementBody")}
                  <textarea
                    className={`${areaClass} mt-2`}
                    onChange={(event) =>
                      updateTranslation("body", event.target.value)
                    }
                    value={selected.translations[locale].body}
                  />
                </label>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button onClick={() => void saveLocale()}>{t("save")}</Button>
                  <Button onClick={() => void copyLocale()} variant="secondary">
                    {t("copy")}
                  </Button>
                </div>
              </div>
            </PermissionGate>
            <PermissionGate permission={publishPermission}>
              <div className="mt-5 grid gap-3 rounded-lg border border-line bg-paper p-4 lg:grid-cols-3">
                <Button
                  onClick={() =>
                    void lifecycle(() =>
                      contentPublicationApi.publishAnnouncement(
                        selected.publicId,
                        selected.releaseId,
                        {
                          idempotencyKey: operationKey(),
                          expectedLockVersion: selected.lockVersion,
                        },
                      ),
                    )
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
                    void lifecycle(() =>
                      contentPublicationApi.scheduleAnnouncement(
                        selected.publicId,
                        selected.releaseId,
                        {
                          idempotencyKey: operationKey(),
                          expectedLockVersion: selected.lockVersion,
                          publishAt: new Date(publishAt).toISOString(),
                        },
                      ),
                    )
                  }
                  variant="secondary"
                >
                  {t("schedule")}
                </Button>
                <input
                  aria-label={t("disableReason")}
                  className={inputClass}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("disableReason")}
                  value={reason}
                />
                <Button
                  disabled={!reason.trim()}
                  onClick={() =>
                    void lifecycle(() =>
                      contentPublicationApi.disableAnnouncement(
                        selected.publicId,
                        selected.releaseId,
                        {
                          idempotencyKey: operationKey(),
                          expectedLockVersion: selected.lockVersion,
                          reason: reason.trim(),
                        },
                      ),
                    )
                  }
                  variant="danger"
                >
                  {t("disable")}
                </Button>
                <Button
                  disabled={!reason.trim() || history.length === 0}
                  onClick={() => {
                    const target = history.find(
                      (item) => item.releaseId !== selected.releaseId,
                    );
                    if (target)
                      void lifecycle(() =>
                        contentPublicationApi.rollbackAnnouncement(
                          selected.publicId,
                          target.releaseId,
                          {
                            idempotencyKey: operationKey(),
                            expectedCurrentVersion: selected.version,
                            reason: reason.trim(),
                          },
                        ),
                      );
                  }}
                  variant="secondary"
                >
                  {t("rollback")}
                </Button>
              </div>
            </PermissionGate>
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
                <h3 className="text-xl font-black text-ink">{preview.translations[locale].title}</h3>
                <Button onClick={() => setPreview(null)} size="sm" variant="secondary">
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
