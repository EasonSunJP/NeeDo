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
import { CarouselReleasePreview } from "./CarouselReleasePreview";
import { UserHomeCarouselWorkspace } from "./UserHomeCarouselWorkspace";
import { contentPublicationEditorText } from "./i18n";

export const contentEditorLocales = [
  "ja",
  "en",
  "ko",
  "zh-TW",
  "zh-CN",
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
  history: CarouselRelease[];
};

type EditorAction =
  | { type: "loading" }
  | {
      type: "loaded";
      payload: BackofficeCarouselScene;
      history: CarouselRelease[];
    }
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
  history: [],
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
      history: action.history,
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
      defaultMediaAssetPublicId: slide.defaultMediaAssetPublicId,
      sortOrder,
      isEnabled: slide.isEnabled,
      visibleFrom: slide.visibleFrom,
      visibleUntil: slide.visibleUntil,
      target: slide.target,
      translations: contentEditorLocales.map((locale) => {
        const value = slide.translations[locale];
        return {
          locale,
          mediaAssetPublicId: value.mediaAssetPublicId,
          badge: value.badge,
          title: value.title,
          caption: value.caption,
          ctaLabel: value.ctaLabel,
          imageAltText: value.imageAltText,
          sourceLocale: value.sourceLocale,
          isInitialCopy: value.isInitialCopy,
        };
      }),
    })),
  };
}

const translationFieldsEqual = (
  left: CarouselReleaseSlide["translations"][ContentLocaleCode],
  right: CarouselReleaseSlide["translations"][ContentLocaleCode],
) =>
  left.mediaAssetPublicId === right.mediaAssetPublicId &&
  left.badge === right.badge &&
  left.title === right.title &&
  left.caption === right.caption &&
  left.ctaLabel === right.ctaLabel &&
  left.imageAltText === right.imageAltText;

function preserveKnownProvenance(
  localDraft: CarouselRelease,
  serverDraft: CarouselRelease,
): CarouselRelease {
  const localById = new Map(
    localDraft.slides.map((slide) => [slide.id, slide]),
  );
  return {
    ...serverDraft,
    slides: serverDraft.slides.map((serverSlide) => {
      const localSlide = localById.get(serverSlide.id);
      if (!localSlide) return serverSlide;
      return {
        ...serverSlide,
        translations: Object.fromEntries(
          contentEditorLocales.map((locale) => {
            const local = localSlide.translations[locale];
            const server = serverSlide.translations[locale];
            return [
              locale,
              translationFieldsEqual(local, server)
                ? {
                    ...server,
                    sourceLocale: local.sourceLocale,
                    isInitialCopy: local.isInitialCopy,
                  }
                : server,
            ];
          }),
        ) as CarouselReleaseSlide["translations"],
      };
    }),
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
    none: string;
    service: string;
    shop: string;
    technician: string;
  },
) {
  if (target.type === "none") return labels.none;
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
  mediaPermission = "button:backoffice-content-media-upload",
  announcementEditor,
}: {
  scene: CarouselSceneSlug;
  readPermission: string;
  editPermission: string;
  publishPermission: string;
  mediaPermission?: string;
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
  const [cloneReason, setCloneReason] = useState("");
  const [draftSourceReleaseId, setDraftSourceReleaseId] = useState("");
  const [disableReleaseId, setDisableReleaseId] = useState("");
  const [rollbackReleaseId, setRollbackReleaseId] = useState("");
  const [dirtyTranslations, setDirtyTranslations] = useState<Set<string>>(
    () => new Set(),
  );
  const [structureDirty, setStructureDirty] = useState(false);
  const [bootstrapTitle, setBootstrapTitle] = useState("");
  const [bootstrapImageAlt, setBootstrapImageAlt] = useState("");
  const [bootstrapMedia, setBootstrapMedia] = useState<{
    publicId: string;
    url: string;
  } | null>(null);
  const [bootstrapTarget, setBootstrapTarget] = useState<
    CarouselReleaseSlide["target"] | null
  >(null);

  const load = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      const [sceneState, history] = await Promise.all([
        contentPublicationApi.getBackofficeCarouselScene(scene),
        contentPublicationApi.getCarouselHistory(scene, {
          page: 1,
          pageSize: 50,
        }),
      ]);
      dispatch({
        type: "loaded",
        payload: sceneState,
        history: history.list,
      });
      setDirtyTranslations(new Set());
      setStructureDirty(false);
      const active = sceneState.scheduled ?? sceneState.published;
      setDisableReleaseId(active ? String(active.releaseId) : "");
      const source = history.list.find((release) => release.status !== "draft");
      setRollbackReleaseId(source ? String(source.releaseId) : "");
      setDraftSourceReleaseId(
        sceneState.published
          ? String(sceneState.published.releaseId)
          : (source ? String(source.releaseId) : ""),
      );
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
  const orderedDraftSlides = draft
    ? [...draft.slides].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      )
    : [];
  const selectedSlideIndex = Math.max(
    0,
    orderedDraftSlides.findIndex((slide) => slide.id === selectedSlide?.id),
  );

  const selectSlideAtIndex = (index: number) => {
    const slide = orderedDraftSlides[index];
    if (slide) dispatch({ type: "select-slide", slideId: slide.id });
  };

  useEffect(() => {
    if (!selectedSlide) return;
    setTargetType(
      selectedSlide.target.type === "affiliate_announcement"
        ? "announcement"
        : selectedSlide.target.type,
    );
  }, [selectedSlide?.id, selectedSlide?.target.type]);

  function replaceSelectedSlide(
    update: (slide: CarouselReleaseSlide) => CarouselReleaseSlide,
    kind: "translation" | "structure" = "structure",
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
    if (kind === "translation") {
      setDirtyTranslations((current) => {
        const next = new Set(current);
        next.add(`${selectedSlide.id}:${state.selectedLocale}`);
        return next;
      });
    } else {
      setStructureDirty(true);
    }
  }

  function updateTranslation(
    field: "badge" | "title" | "caption" | "ctaLabel" | "imageAltText",
    value: string,
  ) {
    replaceSelectedSlide(
      (slide) => ({
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
      }),
      "translation",
    );
  }

  async function saveDraft(): Promise<CarouselRelease | null> {
    if (!draft) return null;
    if (!state.dirty) return draft;
    if (
      structureDirty &&
      draft.slides.some((slide) =>
        contentEditorLocales.some((locale) => {
          const value = slide.translations[locale];
          return value.isInitialCopy;
        }),
      )
    ) {
      dispatch({
        type: "save-error",
        conflict: false,
        message: t("provenanceBlocked"),
      });
      return null;
    }
    dispatch({ type: "saving" });
    try {
      let saved = draft;
      if (structureDirty) {
        const replaced = await contentPublicationApi.replaceCarouselDraft(
          scene,
          draft.releaseId,
          draftBody(draft, state.selectedLocale),
        );
        saved = preserveKnownProvenance(draft, replaced);
      } else {
        const baseline = state.sceneState?.draft;
        const changedKeys = new Set(dirtyTranslations);
        if (baseline) {
          for (const slide of draft.slides) {
            const baselineSlide = baseline.slides.find(
              (candidate) => candidate.id === slide.id,
            );
            if (!baselineSlide) continue;
            for (const locale of contentEditorLocales) {
              const current = slide.translations[locale];
              const previous = baselineSlide.translations[locale];
              if (
                !translationFieldsEqual(current, previous) ||
                current.sourceLocale !== previous.sourceLocale ||
                current.isInitialCopy !== previous.isInitialCopy
              ) {
                changedKeys.add(`${slide.id}:${locale}`);
              }
            }
          }
        }
        for (const key of changedKeys) {
          const separator = key.lastIndexOf(":");
          const slideId = key.slice(0, separator);
          const locale = key.slice(separator + 1) as ContentLocaleCode;
          const slide = saved.slides.find((item) => item.id === slideId);
          if (!slide) continue;
          const value = draft.slides.find((item) => item.id === slideId)
            ?.translations[locale];
          if (!value) continue;
          saved = await contentPublicationApi.updateCarouselSlideLocale(
            scene,
            saved.releaseId,
            slideId,
            locale,
            {
              expectedLockVersion: saved.lockVersion,
              mediaAssetPublicId: value.mediaAssetPublicId,
              badge: value.badge,
              title: value.title,
              caption: value.caption,
              ctaLabel: value.ctaLabel,
              imageAltText: value.imageAltText,
            },
          );
        }
      }
      setDirtyTranslations(new Set());
      setStructureDirty(false);
      dispatch({ type: "replace-draft", draft: saved, notice: t("saved") });
      return saved;
    } catch (error) {
      dispatch({
        type: "save-error",
        conflict: error instanceof ApiClientError && error.status === 409,
        message:
          error instanceof ApiClientError && error.status === 409
            ? t("conflict")
            : t("failedSave"),
      });
      return null;
    }
  }

  async function ensureSaved() {
    return state.dirty ? saveDraft() : draft;
  }

  async function copyLocale() {
    if (!draft || !selectedSlide || !window.confirm(t("copyConfirm"))) return;
    const savedDraft = await ensureSaved();
    if (!savedDraft) return;
    const savedSlide = savedDraft.slides.find(
      (slide) => slide.id === selectedSlide.id,
    );
    if (!savedSlide) return;
    try {
      const saved = await contentPublicationApi.copyCarouselSlideLocaleToAll(
        scene,
        savedDraft.releaseId,
        savedSlide.id,
        {
          expectedLockVersion: savedDraft.lockVersion,
          sourceLocale: state.selectedLocale,
        },
      );
      setDirtyTranslations(new Set());
      setStructureDirty(false);
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

  async function uploadDefaultImage(event: ChangeEvent<HTMLInputElement>) {
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
        defaultMediaAssetPublicId: media.publicId,
        defaultImageUrl: media.url,
        translations: Object.fromEntries(
          contentEditorLocales.map((locale) => {
            const value = slide.translations[locale];
            return [
              locale,
              value.mediaAssetPublicId === null
                ? { ...value, imageUrl: media.url }
                : value,
            ];
          }),
        ) as CarouselReleaseSlide["translations"],
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

  async function uploadLocalizedImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !selectedSlide || !translation) return;
    try {
      const media = await contentPublicationApi.uploadContentImage(
        file,
        translation.imageAltText,
      );
      replaceSelectedSlide(
        (slide) => ({
          ...slide,
          translations: {
            ...slide.translations,
            [state.selectedLocale]: {
              ...slide.translations[state.selectedLocale],
              mediaAssetPublicId: media.publicId,
              imageUrl: media.url,
              sourceLocale: state.selectedLocale,
              isInitialCopy: false,
            },
          },
        }),
        "translation",
      );
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

  function clearLocalizedImage() {
    replaceSelectedSlide(
      (slide) => ({
        ...slide,
        translations: {
          ...slide.translations,
          [state.selectedLocale]: {
            ...slide.translations[state.selectedLocale],
            mediaAssetPublicId: null,
            imageUrl: slide.defaultImageUrl,
            sourceLocale: state.selectedLocale,
            isInitialCopy: false,
          },
        },
      }),
      "translation",
    );
  }

  async function uploadBootstrapImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const media = await contentPublicationApi.uploadContentImage(
        file,
        bootstrapImageAlt,
      );
      setBootstrapMedia({ publicId: media.publicId, url: media.url });
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
    const resolve = (
      current: CarouselReleaseSlide["target"] | null,
    ): CarouselReleaseSlide["target"] | null => {
      if (item.type === "affiliate_task") {
        if (current?.type !== "affiliate_announcement") return current;
        return {
          type: "affiliate_announcement",
          announcementPublicId: current.announcementPublicId,
          taskCode: item.taskCode,
        } as unknown as CarouselReleaseSlide["target"];
      }
      if (item.type === "affiliate_announcement") {
        return {
          type: "affiliate_announcement",
          announcementPublicId: item.target.announcementPublicId,
          taskCode: item.target.taskCode,
        } as unknown as CarouselReleaseSlide["target"];
      }
      return {
        type: item.type,
        publicId: item.publicId,
      } as unknown as CarouselReleaseSlide["target"];
    };
    if (!selectedSlide) {
      setBootstrapTarget((current) => resolve(current));
      return;
    }
    replaceSelectedSlide((slide) => {
      const target = resolve(slide.target);
      return target ? { ...slide, target } : slide;
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
    setStructureDirty(true);
  }

  function addSlide() {
    if (!draft || !selectedSlide) return;
    const id = globalThis.crypto.randomUUID();
    const source = selectedSlide.translations[state.selectedLocale];
    const next: CarouselReleaseSlide = {
      ...selectedSlide,
      id,
      sortOrder: draft.slides.length,
      isEnabled: true,
      translations: Object.fromEntries(
        contentEditorLocales.map((locale) => [
          locale,
          {
            ...source,
            sourceLocale: state.selectedLocale,
            isInitialCopy: locale !== state.selectedLocale,
          },
        ]),
      ) as CarouselReleaseSlide["translations"],
    };
    dispatch({
      type: "edit-draft",
      draft: { ...draft, slides: [...draft.slides, next] },
    });
    dispatch({ type: "select-slide", slideId: id });
    setStructureDirty(true);
  }

  function deleteSlide() {
    if (!draft || !selectedSlide || draft.slides.length <= 1) return;
    dispatch({
      type: "edit-draft",
      draft: {
        ...draft,
        slides: normalizeSortOrder(
          draft.slides.filter((slide) => slide.id !== selectedSlide.id),
        ),
      },
    });
    setStructureDirty(true);
  }

  function toggleSlide() {
    replaceSelectedSlide((slide) => ({
      ...slide,
      isEnabled: !slide.isEnabled,
    }));
  }

  async function performLifecycle(operation: () => Promise<CarouselRelease>) {
    dispatch({ type: "saving" });
    try {
      await operation();
      await load();
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

  const latestVersion = Math.max(
    0,
    ...state.history.map((release) => release.version),
    state.sceneState?.draft?.version ?? 0,
    state.sceneState?.published?.version ?? 0,
    state.sceneState?.scheduled?.version ?? 0,
  );

  async function cloneDraftFromHistory() {
    const sourceReleaseId =
      state.sceneState?.published?.releaseId ?? Number(draftSourceReleaseId);
    if (!sourceReleaseId || !cloneReason.trim()) return;
    await performLifecycle(() =>
      contentPublicationApi.rollbackCarousel(scene, sourceReleaseId, {
        idempotencyKey: idempotencyKey(),
        expectedCurrentVersion: latestVersion,
        reason: cloneReason.trim(),
      }),
    );
  }

  async function createFirstDraft() {
    if (
      !bootstrapMedia ||
      !bootstrapTarget ||
      !bootstrapTitle.trim() ||
      !bootstrapImageAlt.trim()
    )
      return;
    dispatch({ type: "saving" });
    try {
      await contentPublicationApi.createCarouselDraft(scene, {
        idempotencyKey: idempotencyKey(),
        sourceLocale: state.selectedLocale,
        slides: [
          {
            defaultMediaAssetPublicId: bootstrapMedia.publicId,
            sortOrder: 0,
            isEnabled: true,
            visibleFrom: null,
            visibleUntil: null,
            target: bootstrapTarget,
            translations: [
              {
                locale: state.selectedLocale,
                mediaAssetPublicId: null,
                badge: null,
                title: bootstrapTitle.trim(),
                caption: null,
                ctaLabel: null,
                imageAltText: bootstrapImageAlt.trim(),
              },
            ],
          },
        ],
      } as never);
      await load();
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

  function changeTargetType(value: string) {
    setTargetType(value);
    setTargetResults([]);
    setTargetTotal(0);
    setTargetPage(1);
    if (value !== "none" || scene !== "user-home") return;
    if (!selectedSlide) {
      setBootstrapTarget({ type: "none" });
      return;
    }
    replaceSelectedSlide((slide) => ({
      ...slide,
      target: { type: "none" },
      translations: Object.fromEntries(
        contentEditorLocales.map((locale) => [
          locale,
          { ...slide.translations[locale], ctaLabel: null },
        ]),
      ) as CarouselReleaseSlide["translations"],
    }));
  }

  const targetSearchPanel = (
    <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <h3 className="text-sm font-black text-ink">{t("searchTarget")}</h3>
      <select
        className={`${inputClass} mt-3`}
        name="targetType"
        onChange={(event) => changeTargetType(event.target.value)}
        value={targetType}
      >
        {scene === "user-home" ? (
          <>
            <option value="none">{t("noTarget")}</option>
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
      {targetType !== "none" ? (
        <>
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
        </>
      ) : null}
      {targetType !== "none" ? <div className="mt-3 space-y-2">
        {targetResults.map((item) => (
          <button
            className="focus-ring w-full rounded-lg border border-line bg-paper p-3 text-left text-sm font-bold"
            key={`${item.type}-${"publicId" in item ? item.publicId : item.taskCode}`}
            onClick={() => selectTarget(item)}
            type="button"
          >
            {item.label}
            <span className="ml-2 text-xs text-ink/45">{item.status}</span>
          </button>
        ))}
      </div> : null}
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
  );

  const versionOperations = (
    <PermissionGate permission={publishPermission}>
      <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-panel">
        <h2 className="text-lg font-black text-ink">
          {t("versionOperations")}
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <select
            aria-label={t("disable")}
            className={inputClass}
            name="disableReleaseId"
            onChange={(event) => setDisableReleaseId(event.target.value)}
            value={disableReleaseId}
          >
            <option value="">{t("selectVersion")}</option>
            {[state.sceneState?.scheduled, state.sceneState?.published]
              .filter((release): release is CarouselRelease => Boolean(release))
              .map((release) => (
                <option key={release.releaseId} value={release.releaseId}>
                  {release.status} · v{release.version}
                </option>
              ))}
          </select>
          <input
            aria-label={t("disableReason")}
            className={inputClass}
            name="disableReason"
            onChange={(event) => setDisableReason(event.target.value)}
            value={disableReason}
          />
          <Button
            disabled={
              !disableReleaseId || !disableReason.trim() || state.saving
            }
            onClick={() => {
              const active = [
                state.sceneState?.scheduled,
                state.sceneState?.published,
              ].find(
                (release) => release?.releaseId === Number(disableReleaseId),
              );
              if (!active) return;
              void performLifecycle(() =>
                contentPublicationApi.disableCarousel(scene, active.releaseId, {
                  idempotencyKey: idempotencyKey(),
                  expectedLockVersion: active.lockVersion,
                  reason: disableReason.trim(),
                }),
              );
            }}
            variant="danger"
          >
            {t("disable")}
          </Button>
          <select
            aria-label={t("rollback")}
            className={inputClass}
            disabled={Boolean(draft)}
            name="rollbackReleaseId"
            onChange={(event) => setRollbackReleaseId(event.target.value)}
            value={rollbackReleaseId}
          >
            <option value="">{t("selectVersion")}</option>
            {state.history
              .filter((release) => release.status !== "draft")
              .map((release) => (
                <option key={release.releaseId} value={release.releaseId}>
                  {release.status} · v{release.version}
                </option>
              ))}
          </select>
          <input
            aria-label={t("rollbackReason")}
            className={inputClass}
            disabled={Boolean(draft)}
            name="rollbackReason"
            onChange={(event) => setRollbackReason(event.target.value)}
            value={rollbackReason}
          />
          <Button
            disabled={
              Boolean(draft) ||
              !rollbackReleaseId ||
              !rollbackReason.trim() ||
              state.saving
            }
            onClick={() =>
              void performLifecycle(() =>
                contentPublicationApi.rollbackCarousel(
                  scene,
                  Number(rollbackReleaseId),
                  {
                    idempotencyKey: idempotencyKey(),
                    expectedCurrentVersion: latestVersion,
                    reason: rollbackReason.trim(),
                  },
                ),
              )
            }
            variant="secondary"
          >
            {t("rollback")}
          </Button>
        </div>
      </section>
    </PermissionGate>
  );

  const resolvedVersionOperations =
    scene === "user-home" ? (
      <details
        className="rounded-xl border border-line bg-white shadow-panel"
        data-testid="carousel-history"
      >
        <summary className="focus-ring cursor-pointer list-none px-5 py-4 text-sm font-black text-ink marker:hidden">
          <span className="flex items-center justify-between gap-3">
            {t("historyAndRollback")}
            <span aria-hidden="true" className="text-moss">
              ＋
            </span>
          </span>
        </summary>
        <div className="border-t border-line px-5 pb-5">
          {versionOperations}
        </div>
      </details>
    ) : (
      versionOperations
    );

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
    if (!draft) {
      const draftCreationPanel = (
        <section
          className={
            scene === "user-home"
              ? ""
              : "rounded-lg border border-line bg-white p-5 shadow-panel"
          }
        >
            <h2 className="text-lg font-black text-ink">
              {state.sceneState?.published || state.history.length > 0
                ? t("cloneFromHistory")
                : t("createFirstDraft")}
            </h2>
            {scene !== "user-home" ? (
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
            ) : null}
            {state.sceneState?.published || state.history.length > 0 ? (
              <PermissionGate permission={editPermission}>
                <div className="mt-4 grid gap-3 lg:grid-cols-3">
                  {state.sceneState?.published ? (
                    <p className="self-center text-sm font-bold text-ink/60">
                      {t("published")} · v{state.sceneState.published.version}
                    </p>
                  ) : (
                    <select
                      className={inputClass}
                      name="draftSourceReleaseId"
                      onChange={(event) =>
                        setDraftSourceReleaseId(event.target.value)
                      }
                      value={draftSourceReleaseId}
                    >
                      {state.history
                        .filter((release) => release.status !== "draft")
                        .map((release) => (
                          <option
                            key={release.releaseId}
                            value={release.releaseId}
                          >
                            {release.status} · v{release.version}
                          </option>
                        ))}
                    </select>
                  )}
                  <input
                    className={inputClass}
                    name="cloneReason"
                    onChange={(event) => setCloneReason(event.target.value)}
                    placeholder={t("cloneReason")}
                    value={cloneReason}
                  />
                  <Button
                    disabled={
                      (!state.sceneState?.published && !draftSourceReleaseId) ||
                      !cloneReason.trim()
                    }
                    onClick={() => void cloneDraftFromHistory()}
                  >
                    {t("createNewDraft")}
                  </Button>
                </div>
              </PermissionGate>
            ) : (
              <PermissionGate permission={editPermission}>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <input
                    className={inputClass}
                    name="bootstrapTitle"
                    onChange={(event) => setBootstrapTitle(event.target.value)}
                    placeholder={t("title")}
                    value={bootstrapTitle}
                  />
                  <input
                    className={inputClass}
                    name="bootstrapImageAlt"
                    onChange={(event) =>
                      setBootstrapImageAlt(event.target.value)
                    }
                    placeholder={t("imageAlt")}
                    value={bootstrapImageAlt}
                  />
                  <PermissionGate
                    fallback={<Badge>{t("mediaDenied")}</Badge>}
                    permission={mediaPermission}
                  >
                    <label className="focus-ring inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink hover:border-moss">
                      {t("media")}
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        name="bootstrapMedia"
                        onChange={(event) => void uploadBootstrapImage(event)}
                        type="file"
                      />
                    </label>
                  </PermissionGate>
                  <p className="self-center text-sm font-bold text-ink/55">
                    {bootstrapMedia?.url ?? t("mediaRequired")}
                  </p>
                  <div className="lg:col-span-2">{targetSearchPanel}</div>
                  <Button
                    className="lg:col-span-2"
                    disabled={
                      !bootstrapMedia ||
                      !bootstrapTarget ||
                      !bootstrapTitle.trim() ||
                      !bootstrapImageAlt.trim()
                    }
                    onClick={() => void createFirstDraft()}
                  >
                    {t("createFirstDraft")}
                  </Button>
                </div>
              </PermissionGate>
            )}
        </section>
      );

      return (
        <>
          {scene === "user-home" ? (
            <UserHomeCarouselWorkspace
              draft={null}
              getTargetLabel={(slide) =>
                targetLabel(slide.target, {
                  announcement: t("announcement"),
                  none: t("noTarget"),
                  service: t("service"),
                  shop: t("shop"),
                  technician: t("technician"),
                })
              }
              locale={state.selectedLocale}
              onLocaleChange={(locale) =>
                dispatch({ type: "select-locale", locale })
              }
              onSelectedIndexChange={selectSlideAtIndex}
              published={state.sceneState?.published ?? null}
              selectedIndex={0}
            >
              {draftCreationPanel}
            </UserHomeCarouselWorkspace>
          ) : (
            <>
              {state.sceneState?.published ? (
                <CarouselReleasePreview
                  locale={state.selectedLocale}
                  release={state.sceneState.published}
                />
              ) : null}
              {draftCreationPanel}
            </>
          )}
          {resolvedVersionOperations}
        </>
      );
    }

    const form = (readOnly: boolean, compact = false) => (
      <div
        className={
          compact
            ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
            : "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"
        }
      >
        <section
          className={
            compact
              ? "min-w-0"
              : "rounded-lg border border-line bg-white p-5 shadow-panel"
          }
        >
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

          {!compact ? (
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
          ) : null}

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
              {selectedSlide?.target.type !== "none" ? (
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
              ) : null}
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
            <div className="mt-4 space-y-3">
              <Button
                onClick={() => void copyLocale()}
                size="sm"
                variant="secondary"
              >
                {t("copy")}
              </Button>
              <PermissionGate
                fallback={<Badge>{t("mediaDenied")}</Badge>}
                permission={mediaPermission}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line bg-paper p-3">
                    <p className="text-xs font-black text-ink/55">
                      {t("defaultImage")}
                    </p>
                    <label className="focus-ring mt-2 inline-flex h-8 cursor-pointer items-center rounded-full border border-line bg-white px-3 text-xs font-semibold text-ink hover:border-moss">
                      {t("defaultImage")}
                      <input
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        name="defaultMedia"
                        onChange={(event) => void uploadDefaultImage(event)}
                        type="file"
                      />
                    </label>
                  </div>
                  <div className="rounded-lg border border-line bg-mint/10 p-3">
                    <p className="text-xs font-black text-ink/55">
                      {t("localizedImage")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="focus-ring inline-flex h-8 cursor-pointer items-center rounded-full border border-moss/35 bg-white px-3 text-xs font-semibold text-ink hover:border-moss">
                        {t("localizedImage")}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          name="localizedMedia"
                          onChange={(event) =>
                            void uploadLocalizedImage(event)
                          }
                          type="file"
                        />
                      </label>
                      <Button
                        disabled={translation?.mediaAssetPublicId === null}
                        onClick={clearLocalizedImage}
                        size="sm"
                        variant="secondary"
                      >
                        {t("useDefaultImage")}
                      </Button>
                    </div>
                  </div>
                </div>
              </PermissionGate>
            </div>
          ) : null}

          {!compact ? (
            <div className="mt-5 overflow-hidden rounded-lg border border-line bg-paper">
              <img
                alt={translation?.imageAltText ?? ""}
                className="aspect-[15/8] w-full object-cover"
                src={translation?.imageUrl}
              />
              <div className="p-4">
                <p className="text-xs font-black text-ink/45">
                  {selectedSlide
                    ? targetLabel(selectedSlide.target, {
                        announcement: t("announcement"),
                        none: t("noTarget"),
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
          ) : null}
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
                    <div className="mt-2 flex flex-wrap gap-2">
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
                      <input
                        checked={slide.isEnabled}
                        className="sr-only"
                        name="slideEnabled"
                        onChange={() => toggleSlide()}
                        type="checkbox"
                      />
                      <Button
                        onClick={() => toggleSlide()}
                        size="sm"
                        variant="ghost"
                      >
                        {slide.isEnabled ? t("disableSlide") : t("enableSlide")}
                      </Button>
                      <Button
                        disabled={draft.slides.length <= 1}
                        onClick={() => deleteSlide()}
                        size="sm"
                        variant="ghost"
                      >
                        {t("deleteSlide")}
                      </Button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {!readOnly ? (
              <Button
                className="mt-3 w-full"
                onClick={() => addSlide()}
                size="sm"
                variant="secondary"
              >
                {t("addSlide")}
              </Button>
            ) : null}
          </section>

          {!readOnly ? targetSearchPanel : null}
        </aside>
      </div>
    );

    return (
      <>
        {scene === "user-home" ? (
          <UserHomeCarouselWorkspace
            draft={draft}
            getTargetLabel={(slide) =>
              targetLabel(slide.target, {
                announcement: t("announcement"),
                none: t("noTarget"),
                service: t("service"),
                shop: t("shop"),
                technician: t("technician"),
              })
            }
            locale={state.selectedLocale}
            onLocaleChange={(locale) =>
              dispatch({ type: "select-locale", locale })
            }
            onSelectedIndexChange={selectSlideAtIndex}
            published={state.sceneState?.published ?? null}
            selectedIndex={selectedSlideIndex}
          >
            <PermissionGate
              fallback={form(true, true)}
              permission={editPermission}
            >
              {form(false, true)}
            </PermissionGate>
          </UserHomeCarouselWorkspace>
        ) : (
          <PermissionGate fallback={form(true)} permission={editPermission}>
            {form(false)}
          </PermissionGate>
        )}
        <section className="mt-5 rounded-lg border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-black text-ink">
              {t("releaseControls")}
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  const saved = await ensureSaved();
                  if (!saved) return;
                  try {
                    setPreview(
                      await contentPublicationApi.previewCarousel(
                        scene,
                        saved.releaseId,
                      ),
                    );
                  } catch {
                    dispatch({
                      type: "save-error",
                      conflict: false,
                      message: t("loadError"),
                    });
                  }
                }}
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
                  void (async () => {
                    const saved = await ensureSaved();
                    if (!saved) return;
                    await performLifecycle(() =>
                      contentPublicationApi.publishCarousel(
                        scene,
                        saved.releaseId,
                        {
                          idempotencyKey: idempotencyKey(),
                          expectedLockVersion: saved.lockVersion,
                        },
                      ),
                    );
                  })()
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
                  void (async () => {
                    const saved = await ensureSaved();
                    if (!saved) return;
                    await performLifecycle(() =>
                      contentPublicationApi.scheduleCarousel(
                        scene,
                        saved.releaseId,
                        {
                          idempotencyKey: idempotencyKey(),
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
        </section>
        {resolvedVersionOperations}
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
                      src={slide.translations[state.selectedLocale].imageUrl}
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
