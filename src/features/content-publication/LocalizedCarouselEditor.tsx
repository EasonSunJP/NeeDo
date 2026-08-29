import {
  useCallback,
  useEffect,
  useReducer,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  contentPublicationApi,
  type BackofficeCarouselScene,
  type CarouselDraftReplaceInput,
  type CarouselRelease,
  type CarouselReleaseSlide,
  type CarouselSceneSlug,
  type CarouselTargetSearchItem,
  type ContentLocaleCode,
} from "../../api/contentPublication";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { contentPublicationEditorText } from "./i18n";

export const contentEditorLocales = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
] as const;

export const contentEditorLocaleLabels: Record<ContentLocaleCode, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
};

type EditorState = {
  load: "loading" | "ready" | "error";
  sceneState: BackofficeCarouselScene | null;
  draft: CarouselRelease | null;
  selectedLocale: ContentLocaleCode;
  selectedSlideId: string | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  conflict: boolean;
  notice: string | null;
};

type EditorAction =
  | { type: "loading" }
  | { type: "loaded"; payload: BackofficeCarouselScene }
  | { type: "load-error"; message: string }
  | { type: "select-locale"; locale: ContentLocaleCode }
  | { type: "select-slide"; slideId: string }
  | { type: "replace-draft"; draft: CarouselRelease; notice?: string }
  | { type: "edit-draft"; draft: CarouselRelease }
  | { type: "saving" }
  | { type: "save-error"; message: string; conflict: boolean }
  | { type: "notice"; message: string | null };

const initialState: EditorState = {
  load: "loading",
  sceneState: null,
  draft: null,
  selectedLocale: "zh-CN",
  selectedSlideId: null,
  dirty: false,
  saving: false,
  error: null,
  conflict: false,
  notice: null,
};

function reducer(state: EditorState, action: EditorAction): EditorState {
  if (action.type === "loading")
    return { ...state, load: "loading", error: null, conflict: false };
  if (action.type === "loaded") {
    const draft = action.payload.draft;
    return {
      ...state,
      load: "ready",
      sceneState: action.payload,
      draft,
      selectedSlideId: draft?.slides[0]?.id ?? null,
      dirty: false,
      saving: false,
      error: null,
      conflict: false,
      notice: null,
    };
  }
  if (action.type === "load-error")
    return { ...state, load: "error", saving: false, error: action.message };
  if (action.type === "select-locale")
    return { ...state, selectedLocale: action.locale };
  if (action.type === "select-slide")
    return { ...state, selectedSlideId: action.slideId };
  if (action.type === "edit-draft")
    return {
      ...state,
      draft: action.draft,
      dirty: true,
      error: null,
      notice: null,
    };
  if (action.type === "saving")
    return { ...state, saving: true, error: null, notice: null };
  if (action.type === "save-error")
    return {
      ...state,
      saving: false,
      error: action.message,
      conflict: action.conflict,
    };
  if (action.type === "notice") return { ...state, notice: action.message };
  return {
    ...state,
    draft: action.draft,
    sceneState: state.sceneState
      ? { ...state.sceneState, draft: action.draft }
      : state.sceneState,
    selectedSlideId: action.draft.slides.some(
      (slide) => slide.id === state.selectedSlideId,
    )
      ? state.selectedSlideId
      : (action.draft.slides[0]?.id ?? null),
    dirty: false,
    saving: false,
    error: null,
    conflict: false,
    notice: action.notice ?? null,
  };
}

function idempotencyKey() {
  return globalThis.crypto.randomUUID();
}

function normalizeSortOrder(slides: CarouselReleaseSlide[]) {
  return slides.map((slide, sortOrder) => ({ ...slide, sortOrder }));
}

function draftBody(
  draft: CarouselRelease,
  sourceLocale: ContentLocaleCode,
): CarouselDraftReplaceInput {
  return {
    expectedLockVersion: draft.lockVersion,
    sourceLocale,
    slides: draft.slides.map((slide, sortOrder) => ({
      publicId: slide.id,
      mediaAssetPublicId: slide.mediaAssetPublicId,
      sortOrder,
      isEnabled: slide.isEnabled,
      visibleFrom: slide.visibleFrom,
      visibleUntil: slide.visibleUntil,
      target: slide.target,
      translations: contentEditorLocales.map((locale) => ({
        locale,
        ...slide.translations[locale],
      })),
    })),
  };
}

function statusTone(status: CarouselRelease["status"] | "empty") {
  if (status === "published") return "green" as const;
  if (status === "scheduled") return "blue" as const;
  if (status === "draft") return "yellow" as const;
  return "neutral" as const;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-bold text-[#9b352a]"
      role="alert"
    >
      {children}
    </p>
  );
}

const inputClass =
  "focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none disabled:bg-paper disabled:text-ink/45";
const areaClass =
  "focus-ring min-h-24 w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none disabled:bg-paper disabled:text-ink/45";

function targetLabel(
  target: CarouselReleaseSlide["target"],
  labels: {
    announcement: string;
    service: string;
    shop: string;
    technician: string;
  },
) {
  const publicId =
    "publicId" in (target as object)
      ? String((target as unknown as { publicId: string }).publicId)
      : null;
  if (target.type === "shop")
    return publicId
      ? `${labels.shop} ${publicId}`
      : `${labels.shop} #${target.shopId}`;
  if (target.type === "technician")
    return publicId
      ? `${labels.technician} ${publicId}`
      : `${labels.technician} #${target.technicianProfileId}`;
  if (target.type === "service")
    return publicId
      ? `${labels.service} ${publicId}`
      : `${labels.service} #${target.serviceId}`;
  return `${labels.announcement} ${target.announcementPublicId}`;
}

export function LocalizedCarouselEditor({
  scene,
  readPermission,
  editPermission,
  publishPermission,
  announcementEditor,
}: {
  scene: CarouselSceneSlug;
  readPermission: string;
  editPermission: string;
  publishPermission: string;
  announcementEditor?: ReactNode;
}) {
  const { language } = useOptionalI18n();
  const t = useCallback(
    (key: Parameters<typeof contentPublicationEditorText>[0]) =>
      contentPublicationEditorText(key, language),
    [language],
  );
  const [state, dispatch] = useReducer(reducer, initialState);
  const [preview, setPreview] = useState<CarouselRelease | null>(null);
  const [targetType, setTargetType] = useState(
    scene === "user-home" ? "service" : "announcement",
  );
  const [targetQuery, setTargetQuery] = useState("");
  const [targetPage, setTargetPage] = useState(1);
  const [targetResults, setTargetResults] = useState<
    CarouselTargetSearchItem[]
  >([]);
  const [targetTotal, setTargetTotal] = useState(0);
  const [publishAt, setPublishAt] = useState("");
  const [disableReason, setDisableReason] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");

  const load = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      dispatch({
        type: "loaded",
        payload: await contentPublicationApi.getBackofficeCarouselScene(scene),
      });
    } catch {
      dispatch({ type: "load-error", message: t("loadError") });
    }
  }, [scene, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const draft = state.draft;
  const selectedSlide =
    draft?.slides.find((slide) => slide.id === state.selectedSlideId) ??
    draft?.slides[0] ??
    null;
  const translation = selectedSlide?.translations[state.selectedLocale] ?? null;

  function replaceSelectedSlide(
    update: (slide: CarouselReleaseSlide) => CarouselReleaseSlide,
  ) {
    if (!draft || !selectedSlide) return;
    dispatch({
      type: "edit-draft",
      draft: {
        ...draft,
        slides: draft.slides.map((slide) =>
          slide.id === selectedSlide.id ? update(slide) : slide,
        ),
      },
    });
  }

  function updateTranslation(
    field: "badge" | "title" | "caption" | "ctaLabel" | "imageAltText",
    value: string,
  ) {
    replaceSelectedSlide((slide) => ({
      ...slide,
      translations: {
        ...slide.translations,
        [state.selectedLocale]: {
          ...slide.translations[state.selectedLocale],
          [field]:
            field === "title" || field === "imageAltText"
              ? value
              : value || null,
          sourceLocale: state.selectedLocale,
          isInitialCopy: false,
        },
      },
    }));
  }

  async function saveDraft() {
    if (!draft) return;
    dispatch({ type: "saving" });
    try {
      const saved = await contentPublicationApi.replaceCarouselDraft(
        scene,
        draft.releaseId,
        draftBody(draft, state.selectedLocale),
      );
      dispatch({ type: "replace-draft", draft: saved, notice: t("saved") });
    } catch (error) {
      dispatch({
        type: "save-error",
        conflict: error instanceof ApiClientError && error.status === 409,
        message:
          error instanceof ApiClientError && error.status === 409
            ? t("conflict")
            : t("failedSave"),
      });
    }
  }

  async function copyLocale() {
    if (!draft || !selectedSlide || !window.confirm(t("copyConfirm"))) return;
    try {
      const saved = await contentPublicationApi.copyCarouselSlideLocaleToAll(
        scene,
        draft.releaseId,
        selectedSlide.id,
        {
          expectedLockVersion: draft.lockVersion,
          sourceLocale: state.selectedLocale,
        },
      );
      dispatch({ type: "replace-draft", draft: saved });
    } catch (error) {
      dispatch({
        type: "save-error",
        conflict: error instanceof ApiClientError && error.status === 409,
        message:
          error instanceof ApiClientError && error.status === 409
            ? t("conflict")
            : t("failedSave"),
      });
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !selectedSlide) return;
    try {
      const media = await contentPublicationApi.uploadContentImage(
        file,
        selectedSlide.translations[state.selectedLocale].imageAltText,
      );
      replaceSelectedSlide((slide) => ({
        ...slide,
        mediaAssetPublicId: media.publicId,
        imageUrl: media.url,
      }));
      dispatch({ type: "notice", message: t("uploadSuccess") });
    } catch {
      dispatch({
        type: "save-error",
        conflict: false,
        message: t("uploadFailed"),
      });
    } finally {
      input.value = "";
    }
  }

  async function searchTargets(page = 1) {
    const query = {
      page,
      pageSize: 10,
      q: targetQuery.trim(),
      type: targetType,
    } as never;
    try {
      const result = await contentPublicationApi.searchCarouselTargets(
        scene,
        query,
      );
      setTargetResults(result.list);
      setTargetTotal(result.total);
      setTargetPage(page);
    } catch {
      dispatch({
        type: "save-error",
        conflict: false,
        message: t("loadError"),
      });
    }
  }

  function selectTarget(item: CarouselTargetSearchItem) {
    if (!selectedSlide) return;
    replaceSelectedSlide((slide) => {
      if (item.type === "affiliate_task") {
        if (slide.target.type !== "affiliate_announcement") return slide;
        return {
          ...slide,
          target: {
            type: "affiliate_announcement",
            announcementPublicId: slide.target.announcementPublicId,
            taskCode: item.taskCode,
          } as unknown as CarouselReleaseSlide["target"],
        };
      }
      if (item.type === "affiliate_announcement") {
        return {
          ...slide,
          target: {
            type: "affiliate_announcement",
            announcementPublicId: item.target.announcementPublicId,
            taskCode: item.target.taskCode,
          } as unknown as CarouselReleaseSlide["target"],
        };
      }
      return {
        ...slide,
        target: {
          type: item.type,
          publicId: item.publicId,
        } as unknown as CarouselReleaseSlide["target"],
      };
    });
  }

  function moveSlide(direction: -1 | 1) {
    if (!draft || !selectedSlide) return;
    const currentIndex = draft.slides.findIndex(
      (slide) => slide.id === selectedSlide.id,
    );
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= draft.slides.length) return;
    const slides = [...draft.slides];
    [slides[currentIndex], slides[nextIndex]] = [
      slides[nextIndex],
      slides[currentIndex],
    ];
    dispatch({
      type: "edit-draft",
      draft: { ...draft, slides: normalizeSortOrder(slides) },
    });
  }

  async function performLifecycle(operation: () => Promise<CarouselRelease>) {
    dispatch({ type: "saving" });
    try {
      dispatch({ type: "replace-draft", draft: await operation() });
    } catch (error) {
      dispatch({
        type: "save-error",
        conflict: error instanceof ApiClientError && error.status === 409,
        message:
          error instanceof ApiClientError && error.status === 409
            ? t("conflict")
            : t("failedSave"),
      });
    }
  }

  const content = (() => {
    if (state.load === "loading")
      return (
        <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/60">
          {t("loading")}
        </p>
      );
    if (state.load === "error")
      return (
        <ErrorMessage>
          {state.error}
          <Button
            className="ml-3"
            onClick={() => void load()}
            size="sm"
            variant="secondary"
          >
            {t("reload")}
          </Button>
        </ErrorMessage>
      );
    if (!draft)
      return (
        <p className="rounded-lg border border-line bg-white p-6 text-sm font-bold text-ink/60">
          {t("noDraft")}
        </p>
      );

    const form = (readOnly: boolean) => (
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ink/40">
                {scene}
              </p>
              <h2 className="mt-1 text-xl font-black text-ink">
                {t("slide")}{" "}
                {draft.slides.findIndex(
                  (slide) => slide.id === selectedSlide?.id,
                ) + 1}
              </h2>
            </div>
            {readOnly ? (
              <Badge>{t("editDenied")}</Badge>
            ) : (
              <Badge tone={state.dirty ? "yellow" : "green"}>
                {state.dirty ? t("draft") : t("saved")}
              </Badge>
            )}
          </div>

          <div
            className="mt-4 flex overflow-x-auto border-b border-line"
            role="tablist"
          >
            {contentEditorLocales.map((locale) => (
              <button
                aria-selected={locale === state.selectedLocale}
                className={`focus-ring shrink-0 border-b-2 px-4 py-3 text-sm font-black ${locale === state.selectedLocale ? "border-moss text-moss" : "border-transparent text-ink/45"}`}
                key={locale}
                onClick={() => dispatch({ type: "select-locale", locale })}
                role="tab"
                type="button"
              >
                {contentEditorLocaleLabels[locale]}
              </button>
            ))}
          </div>

          {translation?.isInitialCopy ? (
            <p className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold text-yellow-900">
              {t("initialCopy").replace(
                "{locale}",
                contentEditorLocaleLabels[translation.sourceLocale],
              )}
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-black text-ink">
              {t("title")}
              <input
                className={`${inputClass} mt-2`}
                name="title"
                onChange={(event) =>
                  updateTranslation("title", event.target.value)
                }
                readOnly={readOnly}
                value={translation?.title ?? ""}
              />
            </label>
            <label className="text-sm font-black text-ink">
              {t("badge")}
              <input
                className={`${inputClass} mt-2`}
                name="badge"
                onChange={(event) =>
                  updateTranslation("badge", event.target.value)
                }
                readOnly={readOnly}
                value={translation?.badge ?? ""}
              />
            </label>
            <label className="text-sm font-black text-ink">
              {t("caption")}
              <textarea
                className={`${areaClass} mt-2`}
                name="caption"
                onChange={(event) =>
                  updateTranslation("caption", event.target.value)
                }
                readOnly={readOnly}
                value={translation?.caption ?? ""}
              />
            </label>
            <div className="space-y-4">
              <label className="block text-sm font-black text-ink">
                {t("cta")}
                <input
                  className={`${inputClass} mt-2`}
                  name="ctaLabel"
                  onChange={(event) =>
                    updateTranslation("ctaLabel", event.target.value)
                  }
                  readOnly={readOnly}
                  value={translation?.ctaLabel ?? ""}
                />
              </label>
              <label className="block text-sm font-black text-ink">
                {t("imageAlt")}
                <input
                  className={`${inputClass} mt-2`}
                  name="imageAltText"
                  onChange={(event) =>
                    updateTranslation("imageAltText", event.target.value)
                  }
                  readOnly={readOnly}
                  value={translation?.imageAltText ?? ""}
                />
              </label>
            </div>
          </div>

          {!readOnly ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                onClick={() => void copyLocale()}
                size="sm"
                variant="secondary"
              >
                {t("copy")}
              </Button>
              <label className="focus-ring inline-flex h-8 cursor-pointer items-center rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink hover:border-moss">
                {t("media")}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => void uploadImage(event)}
                  type="file"
                />
              </label>
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-lg border border-line bg-paper">
            <img
              alt={translation?.imageAltText ?? ""}
              className="aspect-[15/8] w-full object-cover"
              src={selectedSlide?.imageUrl}
            />
            <div className="p-4">
              <p className="text-xs font-black text-ink/45">
                {selectedSlide
                  ? targetLabel(selectedSlide.target, {
                      announcement: t("announcement"),
                      service: t("service"),
                      shop: t("shop"),
                      technician: t("technician"),
                    })
                  : ""}
              </p>
              <h3 className="mt-1 text-lg font-black text-ink">
                {translation?.title}
              </h3>
              <p className="mt-1 text-sm font-semibold text-ink/60">
                {translation?.caption}
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
            <h3 className="text-sm font-black text-ink">{t("slides")}</h3>
            <div className="mt-3 space-y-2">
              {draft.slides.map((slide, index) => (
                <article
                  className={`rounded-lg border p-3 ${slide.id === selectedSlide?.id ? "border-moss bg-mint/10" : "border-line bg-paper"}`}
                  data-slide-id={slide.id}
                  data-testid="carousel-slide-card"
                  key={slide.id}
                >
                  <button
                    className="focus-ring w-full text-left text-sm font-black"
                    onClick={() =>
                      dispatch({ type: "select-slide", slideId: slide.id })
                    }
                    type="button"
                  >
                    {index + 1}.{" "}
                    {slide.translations[state.selectedLocale].title}
                  </button>
                  {!readOnly && slide.id === selectedSlide?.id ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        aria-label={`上移 ${slide.id}`}
                        className="focus-ring rounded-md border border-line bg-white px-2 py-1 text-xs"
                        disabled={index === 0}
                        onClick={() => moveSlide(-1)}
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`下移 ${slide.id}`}
                        className="focus-ring rounded-md border border-line bg-white px-2 py-1 text-xs"
                        disabled={index === draft.slides.length - 1}
                        onClick={() => moveSlide(1)}
                        type="button"
                      >
                        ↓
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>

          {!readOnly ? (
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h3 className="text-sm font-black text-ink">
                {t("searchTarget")}
              </h3>
              <select
                className={`${inputClass} mt-3`}
                name="targetType"
                onChange={(event) => setTargetType(event.target.value)}
                value={targetType}
              >
                {scene === "user-home" ? (
                  <>
                    <option value="shop">{t("shop")}</option>
                    <option value="technician">{t("technician")}</option>
                    <option value="service">{t("service")}</option>
                  </>
                ) : (
                  <>
                    <option value="announcement">{t("announcement")}</option>
                    <option value="affiliate_task">{t("affiliateTask")}</option>
                  </>
                )}
              </select>
              <input
                aria-label={t("targetQuery")}
                className={`${inputClass} mt-2`}
                name="targetQuery"
                onChange={(event) => setTargetQuery(event.target.value)}
                value={targetQuery}
              />
              <Button
                className="mt-2 w-full"
                onClick={() => void searchTargets(1)}
                size="sm"
                variant="secondary"
              >
                {t("searchTarget")}
              </Button>
              <div className="mt-3 space-y-2">
                {targetResults.map((item) => (
                  <button
                    className="focus-ring w-full rounded-lg border border-line bg-paper p-3 text-left text-sm font-bold"
                    key={`${item.type}-${"publicId" in item ? item.publicId : item.taskCode}`}
                    onClick={() => selectTarget(item)}
                    type="button"
                  >
                    {item.label}
                    <span className="ml-2 text-xs text-ink/45">
                      {item.status}
                    </span>
                  </button>
                ))}
              </div>
              {targetTotal > targetPage * 10 ? (
                <Button
                  className="mt-3 w-full"
                  onClick={() => void searchTargets(targetPage + 1)}
                  size="sm"
                  variant="ghost"
                >
                  {t("nextPage")}
                </Button>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    );

    return (
      <>
        <PermissionGate fallback={form(true)} permission={editPermission}>
          {form(false)}
        </PermissionGate>
        <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-ink">
              {t("releaseControls")}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () =>
                  setPreview(
                    await contentPublicationApi.previewCarousel(
                      scene,
                      draft.releaseId,
                    ),
                  )
                }
                variant="secondary"
              >
                {t("preview")}
              </Button>
              <PermissionGate permission={editPermission}>
                <Button
                  disabled={state.saving}
                  onClick={() => void saveDraft()}
                >
                  {t("save")}
                </Button>
              </PermissionGate>
            </div>
          </div>
          <PermissionGate permission={publishPermission}>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <Button
                disabled={state.saving}
                onClick={() =>
                  void performLifecycle(() =>
                    contentPublicationApi.publishCarousel(
                      scene,
                      draft.releaseId,
                      {
                        idempotencyKey: idempotencyKey(),
                        expectedLockVersion: draft.lockVersion,
                      },
                    ),
                  )
                }
              >
                {t("publish")}
              </Button>
              <label className="text-xs font-black text-ink/60">
                {t("publishAt")}
                <input
                  className={`${inputClass} mt-1`}
                  name="publishAt"
                  onChange={(event) => setPublishAt(event.target.value)}
                  type="datetime-local"
                  value={publishAt}
                />
              </label>
              <Button
                disabled={!publishAt || state.saving}
                onClick={() =>
                  void performLifecycle(() =>
                    contentPublicationApi.scheduleCarousel(
                      scene,
                      draft.releaseId,
                      {
                        idempotencyKey: idempotencyKey(),
                        expectedLockVersion: draft.lockVersion,
                        publishAt: new Date(publishAt).toISOString(),
                      },
                    ),
                  )
                }
                variant="secondary"
              >
                {t("schedule")}
              </Button>
              <label className="text-xs font-black text-ink/60">
                {t("disableReason")}
                <input
                  className={`${inputClass} mt-1`}
                  name="disableReason"
                  onChange={(event) => setDisableReason(event.target.value)}
                  value={disableReason}
                />
              </label>
              <Button
                disabled={!disableReason.trim() || state.saving}
                onClick={() =>
                  void performLifecycle(() =>
                    contentPublicationApi.disableCarousel(
                      scene,
                      draft.releaseId,
                      {
                        idempotencyKey: idempotencyKey(),
                        expectedLockVersion: draft.lockVersion,
                        reason: disableReason.trim(),
                      },
                    ),
                  )
                }
                variant="danger"
              >
                {t("disable")}
              </Button>
              <span />
              <label className="text-xs font-black text-ink/60">
                {t("rollbackReason")}
                <input
                  className={`${inputClass} mt-1`}
                  name="rollbackReason"
                  onChange={(event) => setRollbackReason(event.target.value)}
                  value={rollbackReason}
                />
              </label>
              <Button
                disabled={
                  !rollbackReason.trim() ||
                  !state.sceneState?.published ||
                  state.saving
                }
                onClick={() => {
                  const published = state.sceneState?.published;
                  if (!published) return;
                  void performLifecycle(() =>
                    contentPublicationApi.rollbackCarousel(
                      scene,
                      published.releaseId,
                      {
                        idempotencyKey: idempotencyKey(),
                        expectedCurrentVersion: published.version,
                        reason: rollbackReason.trim(),
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
        </section>
      </>
    );
  })();

  return (
    <PermissionGate
      fallback={<ErrorMessage>403 · {t("editDenied")}</ErrorMessage>}
      permission={readPermission}
    >
      <div className="space-y-5" data-scene={scene}>
        <header className="rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">
                {t("contentPublication")}
              </p>
              <h1 className="mt-1 text-2xl font-black text-ink">
                {t("carouselEditor")}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                tone={statusTone(state.sceneState?.draft?.status ?? "empty")}
              >
                {t("draft")} · v{state.sceneState?.draft?.version ?? "—"}
              </Badge>
              <Badge
                tone={statusTone(
                  state.sceneState?.published?.status ?? "empty",
                )}
              >
                {t("published")} · v
                {state.sceneState?.published?.version ?? "—"}
              </Badge>
              <Badge
                tone={statusTone(
                  state.sceneState?.scheduled?.status ?? "empty",
                )}
              >
                {t("scheduled")} · v
                {state.sceneState?.scheduled?.version ?? "—"}
              </Badge>
            </div>
          </div>
        </header>
        {state.error ? (
          <ErrorMessage>
            {state.error}
            {state.conflict ? (
              <Button
                className="ml-3"
                onClick={() => void load()}
                size="sm"
                variant="secondary"
              >
                {t("reload")}
              </Button>
            ) : null}
          </ErrorMessage>
        ) : null}
        {state.notice ? (
          <p
            className="rounded-lg border border-mint bg-mint/10 px-4 py-3 text-sm font-bold text-ink"
            role="status"
          >
            {state.notice}
          </p>
        ) : null}
        {announcementEditor}
        {content}
        {preview ? (
          <div
            aria-modal="true"
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5"
            role="dialog"
          >
            <section className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-line bg-white p-5 shadow-soft">
              <div className="flex justify-between gap-3">
                <h2 className="text-xl font-black">{t("preview")}</h2>
                <Button
                  onClick={() => setPreview(null)}
                  size="sm"
                  variant="secondary"
                >
                  {t("closePreview")}
                </Button>
              </div>
              <div className="mt-4 grid gap-3">
                {preview.slides.map((slide) => (
                  <article
                    className="rounded-lg border border-line bg-paper p-4"
                    key={slide.id}
                  >
                    <img
                      alt={
                        slide.translations[state.selectedLocale].imageAltText
                      }
                      className="aspect-[15/8] w-full rounded-lg object-cover"
                      src={slide.imageUrl}
                    />
                    <h3 className="mt-3 text-lg font-black">
                      {slide.translations[state.selectedLocale].title}
                    </h3>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </PermissionGate>
  );
}
