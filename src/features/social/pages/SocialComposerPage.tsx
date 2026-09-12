import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MobileShell } from "../../../components/mobile/MobileShell";
import { cn } from "../../../lib/utils";
import { emitShareFeedback } from "../../../lib/shareFeedback";
import { resolveCustomerMembership } from "../../../shared/profile-card/customerMembership";
import {
  ComposerCommentPermissionSelector,
  ComposerLocationSelector,
  ComposerMediaPicker,
  ComposerMentionSelector,
  ComposerSettingItem,
  ComposerSettingList,
  ComposerTextArea,
  ComposerTopBar,
  ComposerVisibilitySelector,
  summarizeCommentPermission,
  summarizeMentionCandidates,
  summarizeVisibility
} from "../components/UnifiedComposerUi";
import {
  areSocialComposerMediaUploadsComplete,
  getSocialComposerErrorMessage,
  getSocialImageValidationError,
  isSocialComposerPublishReady,
  resolveSocialComposerMediaUploads
} from "../composer-media";
import { buildSocialLocationOptions } from "../composer-location";
import { SocialPostItem } from "../components/SocialUi";
import { useSocial } from "../context";
import { loadFormalSocialMentionCandidates } from "../formal-contacts";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { realtimeApi } from "../../realtime/api";
import type { SocialCommentPermission, SocialComposerDraft, SocialMediaItem, SocialMentionCandidate, SocialPost, SocialPostType, SocialProfile, SocialVisibility } from "../types";
import {
  isValidSocialPostMediaSet,
  nextId,
  profileKey,
  socialImageUploadLimit,
  unique
} from "../utils";

const linkPattern = /(https?:\/\/[^\s]+)/;
const freeComposerTextLimit = 300;
const paidComposerTextLimit = 3000;
const blackCardComposerTextLimit = 10000;

type ComposerView = "composer" | "location" | "mentions" | "visibility" | "comment-permission";

export function SocialComposerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { state, profiles, profileList, getActorForScope, getPostById, createPost, updatePost, saveDraft, clearDraft } = useSocial();
  const defaultActorKey = getActorForScope(scope);
  const quotePostId = searchParams.get("quotePostId") ?? undefined;
  const editPostId = searchParams.get("editPostId") ?? undefined;
  const draftKey = `composer:${scope}:${editPostId ?? quotePostId ?? "root"}`;
  const draft = state.drafts[draftKey];
  const editPost = editPostId ? getPostById(editPostId, defaultActorKey) : undefined;
  const selectedAuthorFromQuery = searchParams.get("author") ?? undefined;
  const draftAuthorKey = draft?.authorKey === defaultActorKey && profiles[draft.authorKey] ? draft.authorKey : undefined;
  const requestedAuthorKey =
    selectedAuthorFromQuery === defaultActorKey && profiles[selectedAuthorFromQuery] ? selectedAuthorFromQuery : undefined;
  const initialAuthorKey =
    (editPost ? profileKey({ entityType: editPost.authorType, id: editPost.authorId }) : undefined) ??
    draftAuthorKey ??
    requestedAuthorKey ??
    defaultActorKey;

  const quotePost = quotePostId ? getPostById(quotePostId, initialAuthorKey) : undefined;
  const author = profiles[initialAuthorKey];
  const textLimit = useMemo(() => getComposerTextLimit(author), [author]);

  const postTypeOptions = useMemo<Array<{ label: string; value: SocialPostType }>>(() => {
    if (quotePostId) {
      return [{ label: "引用", value: "quote" }];
    }

    if (author?.entityType === "shop") {
      return [
        { label: "动态", value: "post" },
        { label: "公告", value: "announcement" }
      ];
    }

    if (author?.entityType === "technician") {
      return [
        { label: "动态", value: "post" },
        { label: "日常", value: "technician-daily" }
      ];
    }

    return [{ label: "动态", value: "post" }];
  }, [author?.entityType, quotePostId]);

  const initialComposerState = useMemo(
    () => {
      const snapshot = createComposerSnapshot({
        draft,
        editPost,
        fallbackPostType: postTypeOptions[0]?.value ?? "post"
      });

      return clampComposerSnapshotText(snapshot, textLimit);
    },
    [draft, editPost, postTypeOptions, textLimit]
  );
  const [view, setView] = useState<ComposerView>("composer");
  const [initialSnapshot, setInitialSnapshot] = useState(initialComposerState);
  const [text, setText] = useState(initialComposerState.text);
  const [media, setMedia] = useState(initialComposerState.media);
  const [visibility, setVisibility] = useState<SocialVisibility>(initialComposerState.visibility);
  const [visibilityTagIds, setVisibilityTagIds] = useState<string[]>(initialComposerState.visibilityTagIds);
  const [visibilityProfileKeys, setVisibilityProfileKeys] = useState<string[]>(initialComposerState.visibilityProfileKeys);
  const [includeRelatedPeople, setIncludeRelatedPeople] = useState(initialComposerState.includeRelatedPeople);
  const [commentPermission, setCommentPermission] = useState<SocialCommentPermission>(initialComposerState.commentPermission);
  const [locationLabel, setLocationLabel] = useState(initialComposerState.locationLabel);
  const [mentionUserIds, setMentionUserIds] = useState<number[]>(initialComposerState.mentionUserIds);
  const [allMentionCandidates, setAllMentionCandidates] = useState<SocialMentionCandidate[]>([]);
  const [mentionStatus, setMentionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mentionQuery, setMentionQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [postType, setPostType] = useState<SocialPostType>(initialComposerState.postType);
  const [mediaError, setMediaError] = useState("");
  const [mediaUploadStateById, setMediaUploadStateById] = useState<Record<string, "optimizing" | "uploading" | "failed" | "cancelled">>({});
  const mediaFileByIdRef = useRef(new Map<string, File>());
  const mediaPreviewUrlByIdRef = useRef(new Map<string, string>());
  const mediaUploadTaskByIdRef = useRef(new Map<string, Promise<SocialMediaItem>>());
  const mediaUploadAbortByIdRef = useRef(new Map<string, AbortController>());
  const publishStartedRef = useRef(false);
  const isMountedRef = useRef(true);

  const clearTransientMedia = useCallback(() => {
    mediaUploadAbortByIdRef.current.forEach((controller) => controller.abort());
    mediaUploadAbortByIdRef.current.clear();
    mediaPreviewUrlByIdRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    mediaPreviewUrlByIdRef.current.clear();
    mediaFileByIdRef.current.clear();
    mediaUploadTaskByIdRef.current.clear();
    setMediaUploadStateById({});
  }, []);

  useEffect(() => {
    const nextSnapshot = clampComposerSnapshotText(
      createComposerSnapshot({
        draft,
        editPost,
        fallbackPostType: postTypeOptions[0]?.value ?? "post"
      }),
      textLimit
    );

    setInitialSnapshot(nextSnapshot);
    clearTransientMedia();
    setView("composer");
    setText(nextSnapshot.text);
    setMedia(nextSnapshot.media);
    setVisibility(nextSnapshot.visibility);
    setVisibilityTagIds(nextSnapshot.visibilityTagIds);
    setVisibilityProfileKeys(nextSnapshot.visibilityProfileKeys);
    setIncludeRelatedPeople(nextSnapshot.includeRelatedPeople);
    setCommentPermission(nextSnapshot.commentPermission);
    setLocationLabel(nextSnapshot.locationLabel);
    setMentionUserIds(nextSnapshot.mentionUserIds);
    setAllMentionCandidates([]);
    setMentionStatus("idle");
    setPostType(nextSnapshot.postType);
    setMediaError("");
    setMentionQuery("");
    setLocationQuery("");
  }, [clearTransientMedia, draftKey, editPost?.id, initialAuthorKey, postTypeOptions, quotePostId, selectedAuthorFromQuery, textLimit]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      mediaUploadAbortByIdRef.current.forEach((controller) => controller.abort());
      mediaPreviewUrlByIdRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  useEffect(() => {
    if (!postTypeOptions.some((option) => option.value === postType)) {
      setPostType(postTypeOptions[0]?.value ?? "post");
    }
  }, [postType, postTypeOptions]);

  const initialSignature = useMemo(
    () =>
      JSON.stringify({
        text: initialSnapshot.text,
        media: initialSnapshot.media.map((item) => item.id),
        visibility: initialSnapshot.visibility,
        visibilityTagIds: initialSnapshot.visibilityTagIds,
        visibilityProfileKeys: initialSnapshot.visibilityProfileKeys,
        includeRelatedPeople: initialSnapshot.includeRelatedPeople,
        commentPermission: initialSnapshot.commentPermission,
        locationLabel: initialSnapshot.locationLabel,
        mentionUserIds: initialSnapshot.mentionUserIds,
        postType: initialSnapshot.postType
      }),
    [initialSnapshot]
  );
  const currentSignature = useMemo(
    () =>
      JSON.stringify({
        text,
        media: media.map((item) => item.id),
        visibility,
        visibilityTagIds,
        visibilityProfileKeys,
        includeRelatedPeople,
        commentPermission,
        locationLabel,
        mentionUserIds,
        postType
      }),
    [commentPermission, includeRelatedPeople, locationLabel, media, mentionUserIds, postType, text, visibility, visibilityProfileKeys, visibilityTagIds]
  );
  const isDirty = currentSignature !== initialSignature;
  const hasValidMediaSet = isValidSocialPostMediaSet(media);
  const mediaUploadsComplete = areSocialComposerMediaUploadsComplete(media);
  const canPublish = hasValidMediaSet &&
    isSocialComposerPublishReady({ text, media }) &&
    (!editPostId || mediaUploadsComplete);
  const failedMediaUploadStateById = useMemo(
    () => Object.fromEntries(
      Object.entries(mediaUploadStateById).filter(([, status]) => status === "failed")
    ) as Record<string, "failed">,
    [mediaUploadStateById]
  );
  const detectedLink = useMemo(() => text.match(linkPattern)?.[1], [text]);
  const handleTextChange = (value: string) => {
    setText(value.slice(0, textLimit));
  };

  useEffect(() => {
    if (editPostId) {
      return;
    }

    const hasDraftContent =
      text.trim().length > 0 ||
      media.length > 0 ||
      visibility !== "public" ||
      visibilityTagIds.length > 0 ||
      visibilityProfileKeys.length > 0 ||
      includeRelatedPeople ||
      commentPermission !== "everyone" ||
      Boolean(locationLabel) ||
      mentionUserIds.length > 0 ||
      postType !== (postTypeOptions[0]?.value ?? "post");

    if (!hasDraftContent) {
      clearDraft(draftKey);
      return;
    }

    saveDraft(draftKey, {
      authorKey: initialAuthorKey,
      text,
      media: media.filter((item) => Boolean(item.mediaAssetPublicId)),
      quotePostId,
      editPostId,
      postType,
      visibility,
      visibilityTagIds,
      visibilityProfileKeys,
      includeRelatedPeople,
      commentPermission,
      locationLabel,
      mentionUserIds,
      updatedAt: new Date().toISOString()
    });
  }, [
    clearDraft,
    commentPermission,
    draftKey,
    editPostId,
    includeRelatedPeople,
    initialAuthorKey,
    locationLabel,
    media,
    mentionUserIds,
    postType,
    postTypeOptions,
    quotePostId,
    saveDraft,
    text,
    visibility,
    visibilityProfileKeys,
    visibilityTagIds
  ]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const loadMentionCandidates = useCallback(async () => {
    setMentionStatus("loading");

    try {
      const candidates = await loadFormalSocialMentionCandidates();
      setAllMentionCandidates(candidates);
      setMentionStatus("ready");
    } catch {
      setMentionStatus("error");
    }
  }, []);

  useEffect(() => {
    if (view === "mentions" && mentionStatus === "idle") {
      void loadMentionCandidates();
    }
  }, [loadMentionCandidates, mentionStatus, view]);

  const mentionCandidates = useMemo(() => {
    const normalized = mentionQuery.trim().toLowerCase();

    return allMentionCandidates.filter(
      (candidate) => !normalized || candidate.searchText.toLowerCase().includes(normalized)
    );
  }, [allMentionCandidates, mentionQuery]);

  const locationOptions = useMemo(() => {
    return buildSocialLocationOptions(author?.location, locationQuery);
  }, [author?.location, locationQuery]);

  const uploadMediaFile = useCallback(async (mediaId: string, file: File) => {
    mediaUploadAbortByIdRef.current.get(mediaId)?.abort();
    const controller = new AbortController();
    mediaUploadAbortByIdRef.current.set(mediaId, controller);
    setMediaUploadStateById((current) => ({ ...current, [mediaId]: "optimizing" }));
    setMediaError("图片正在本地优化并上传…");
    const uploadTask = realtimeApi.uploadSocialMedia(file, {
      signal: controller.signal,
      onStage: () => {
        if (isMountedRef.current && mediaFileByIdRef.current.get(mediaId) === file) {
          setMediaUploadStateById((current) => ({ ...current, [mediaId]: "optimizing" }));
        }
      },
      onUploadStart: () => {
        if (isMountedRef.current && mediaFileByIdRef.current.get(mediaId) === file) {
          setMediaUploadStateById((current) => ({ ...current, [mediaId]: "uploading" }));
          setMediaError("");
        }
      }
    }).then<SocialMediaItem>((uploaded) => ({
      id: mediaId,
      type: "image",
      url: uploaded.url,
      alt: file.name,
      mediaAssetPublicId: uploaded.publicId
    }));
    mediaUploadTaskByIdRef.current.set(mediaId, uploadTask);

    try {
      const uploadedMedia = await uploadTask;

      if (mediaFileByIdRef.current.get(mediaId) !== file) {
        return;
      }

      if (isMountedRef.current) {
        setMedia((current) => current.map((item) =>
          item.id === mediaId ? { ...item, ...uploadedMedia } : item
        ));
      }
      const previewUrl = mediaPreviewUrlByIdRef.current.get(mediaId);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      mediaPreviewUrlByIdRef.current.delete(mediaId);
      mediaFileByIdRef.current.delete(mediaId);
      if (isMountedRef.current) {
        setMediaUploadStateById((current) => {
          const next = { ...current };
          delete next[mediaId];
          return next;
        });
      }
    } catch (error) {
      if (mediaFileByIdRef.current.get(mediaId) !== file) {
        return;
      }

      if (isMountedRef.current) {
        const cancelled = error instanceof DOMException && error.name === "AbortError";
        setMediaUploadStateById((current) => ({
          ...current,
          [mediaId]: cancelled ? "cancelled" : "failed"
        }));
        setMediaError(getSocialComposerErrorMessage(error));
      }
    } finally {
      if (mediaUploadAbortByIdRef.current.get(mediaId) === controller) {
        mediaUploadAbortByIdRef.current.delete(mediaId);
      }
    }
  }, []);

  const handleMediaFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    const validFiles: File[] = [];
    let validationError = "";

    files.forEach((file) => {
      const error = getSocialImageValidationError(file);
      if (error) {
        validationError ||= error;
      } else {
        validFiles.push(file);
      }
    });

    const remainingSlots = Math.max(0, socialImageUploadLimit - media.length);
    const selectedFiles = validFiles.slice(0, remainingSlots);
    const pendingItems = selectedFiles.map((file) => {
      const id = nextId("media");
      const previewUrl = URL.createObjectURL(file);
      mediaFileByIdRef.current.set(id, file);
      mediaPreviewUrlByIdRef.current.set(id, previewUrl);
      return {
        file,
        item: {
          id,
          type: "image" as const,
          url: previewUrl,
          alt: file.name
        }
      };
    });

    if (pendingItems.length > 0) {
      setMedia((current) => [...current, ...pendingItems.map(({ item }) => item)]);
      pendingItems.forEach(({ file, item }) => void uploadMediaFile(item.id, file));
    }

    setMediaError(
      validationError ||
      (validFiles.length > remainingSlots ? "已达到 9 张图片上限，超出的图片没有加入。" : "")
    );
    input.value = "";
  };

  const handleRetryMediaUpload = (mediaId: string) => {
    const file = mediaFileByIdRef.current.get(mediaId);
    if (!file) {
      setMediaError("图片上传失败，请重新选择图片。");
      return;
    }

    setMediaError("");
    void uploadMediaFile(mediaId, file);
  };

  const handleRemoveMedia = (mediaId: string) => {
    mediaUploadAbortByIdRef.current.get(mediaId)?.abort();
    mediaUploadAbortByIdRef.current.delete(mediaId);
    const previewUrl = mediaPreviewUrlByIdRef.current.get(mediaId);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    mediaPreviewUrlByIdRef.current.delete(mediaId);
    mediaFileByIdRef.current.delete(mediaId);
    mediaUploadTaskByIdRef.current.delete(mediaId);
    setMediaUploadStateById((current) => {
      const next = { ...current };
      delete next[mediaId];
      return next;
    });
    setMedia((current) => current.filter((item) => item.id !== mediaId));
    setMediaError("");
  };

  const handleCancel = () => {
    if (!isDirty) {
      navigate(-1);
      return;
    }

    if (editPostId) {
      const shouldDiscard = window.confirm("要放弃这次修改吗？点击“确定”放弃修改并退出，点击“取消”继续编辑。");

      if (shouldDiscard) {
        navigate(-1);
      }

      return;
    }

    const shouldDiscard = window.confirm("要放弃当前内容吗？点击“确定”放弃并退出，点击“取消”保留草稿后退出。");

    if (shouldDiscard) {
      clearDraft(draftKey);
    }

    navigate(-1);
  };

  const handlePublish = () => {
    if (!canPublish || !author || publishStartedRef.current) {
      if (!hasValidMediaSet) {
        setMediaError("一条动态最多发布 9 张图片。");
      } else if (editPostId && !mediaUploadsComplete) {
        setMediaError("图片正在上传，请稍候。失败的图片可以点击重试。");
      }

      return;
    }

    publishStartedRef.current = true;
    setIsPublishing(true);
    setMediaError("");

    if (editPostId) {
      void (async () => {
        try {
          const nextPost = await updatePost({
            actorKey: initialAuthorKey,
            postId: editPostId,
            text,
            media,
            visibility,
            visibilityTagIds,
            visibilityProfileKeys,
            includeRelatedPeople,
            commentPermission,
            locationLabel: locationLabel || undefined,
            mentionUserIds,
            postType: editPost?.postType ?? postType
          });

          if (nextPost) {
            clearDraft(draftKey);
            navigate(socialPaths.timeline(scope), { replace: true });
          }
        } catch (error) {
          publishStartedRef.current = false;
          setMediaError(getSocialComposerErrorMessage(error));
        } finally {
          setIsPublishing(false);
        }
      })();
      return;
    }

    const submissionMedia = [...media];
    const submissionUploadTasks = new Map(mediaUploadTaskByIdRef.current);
    const publishNewPostInBackground = async () => {
      try {
        const uploadedMedia = await resolveSocialComposerMediaUploads(
          submissionMedia,
          submissionUploadTasks
        );
        const nextPost = await createPost({
          authorKey: initialAuthorKey,
          media: uploadedMedia,
          quotePostId,
          text,
          visibility,
          visibilityTagIds,
          visibilityProfileKeys,
          includeRelatedPeople,
          commentPermission,
          locationLabel: locationLabel || undefined,
          mentionUserIds,
          postType
        });

        if (nextPost) {
          clearDraft(draftKey);
        }
      } catch (error) {
        emitShareFeedback({
          type: "toast",
          message: getSocialComposerErrorMessage(error),
          tone: "danger"
        });
      }
    };

    navigate(socialPaths.timeline(scope), { replace: true });
    void publishNewPostInBackground();
  };

  if (!author) {
    return null;
  }

  if (view === "location") {
    return (
      <MobileShell className="!pb-0" navItems={[]}>
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--client-primary)_16%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg-soft)_84%,var(--client-bg))_0%,var(--client-bg)_100%)] text-[color:var(--client-text)]">
          <ComposerLocationSelector
            authorLocation={author.location}
            onBack={() => setView("composer")}
            onQueryChange={setLocationQuery}
            onSelect={setLocationLabel}
            options={locationOptions}
            query={locationQuery}
            selectedValue={locationLabel}
          />
        </div>
      </MobileShell>
    );
  }

  if (view === "mentions") {
    return (
      <MobileShell className="!pb-0" navItems={[]}>
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--client-primary)_16%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg-soft)_84%,var(--client-bg))_0%,var(--client-bg)_100%)] text-[color:var(--client-text)]">
          <ComposerMentionSelector
            candidates={mentionCandidates}
            onBack={() => setView("composer")}
            onQueryChange={setMentionQuery}
            onRetry={() => void loadMentionCandidates()}
            onToggle={(value) =>
              setMentionUserIds((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
            }
            query={mentionQuery}
            selectedUserIds={mentionUserIds}
            status={mentionStatus === "idle" ? "loading" : mentionStatus}
          />
        </div>
      </MobileShell>
    );
  }

  if (view === "visibility") {
    const availableVisibilityTags = buildVisibilityTagOptions(author);
    const visibilityProfileOptions = profileList.filter((profile) => profileKey(profile) !== initialAuthorKey);

    return (
      <MobileShell className="!pb-0" navItems={[]}>
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--client-primary)_16%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg-soft)_84%,var(--client-bg))_0%,var(--client-bg)_100%)] text-[color:var(--client-text)]">
          <ComposerVisibilitySelector
            availableTags={availableVisibilityTags}
            includeRelatedPeople={includeRelatedPeople}
            onBack={() => setView("composer")}
            onChange={setVisibility}
            onIncludeRelatedPeopleChange={setIncludeRelatedPeople}
            onToggleProfile={(key) =>
              setVisibilityProfileKeys((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]))
            }
            onToggleTag={(tag) =>
              setVisibilityTagIds((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]))
            }
            profileOptions={visibilityProfileOptions}
            selectedProfileKeys={visibilityProfileKeys}
            selectedTagIds={visibilityTagIds}
            value={visibility}
          />
        </div>
      </MobileShell>
    );
  }

  if (view === "comment-permission") {
    return (
      <MobileShell className="!pb-0" navItems={[]}>
        <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--client-primary)_16%,transparent),transparent_34%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg-soft)_84%,var(--client-bg))_0%,var(--client-bg)_100%)] text-[color:var(--client-text)]">
          <ComposerCommentPermissionSelector
            onBack={() => setView("composer")}
            onChange={setCommentPermission}
            value={commentPermission}
          />
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell className="!pb-0" navItems={[]}>
      <div className="relative h-[100dvh] overflow-hidden bg-[color:var(--client-bg)] text-[color:var(--client-text)]" data-page-drag-ignore="true">
        <div
          aria-hidden="true"
          className="fixed inset-0 z-0 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--client-primary)_18%,transparent),transparent_36%),linear-gradient(180deg,color-mix(in_srgb,var(--client-bg-soft)_84%,var(--client-bg))_0%,var(--client-bg)_100%)]"
        />
        <div className="relative z-[1] h-full">
          <ComposerTopBar
            canPublish={canPublish}
            isPublishing={isPublishing}
            onCancel={handleCancel}
            onPublish={handlePublish}
            publishLabel={editPostId ? "保存" : "发表"}
          />

          <div className="client-app-gutter fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+392px)] top-[calc(env(safe-area-inset-top)+88px)] z-20 overflow-y-auto overscroll-contain pb-4">
            <div className="client-app-frame flex min-h-full flex-col">
              <ComposerTextArea
                author={author}
                authorTo={author ? socialPaths.profile(scope, author) : undefined}
                hint={detectedLink ? `已检测到链接：${detectedLink}` : undefined}
                leading={
                  postTypeOptions.length > 1 || quotePost ? (
                    <div className="space-y-3">
                      {postTypeOptions.length > 1 ? <ComposerTypeSwitch onChange={setPostType} options={postTypeOptions} value={postType} /> : null}
                      {quotePost ? (
                        <ComposerContextCard title="引用动态">
                          <SocialPostItem actorKey={initialAuthorKey} compact hideActions post={quotePost} scope={scope} />
                        </ComposerContextCard>
                      ) : null}
                    </div>
                  ) : null
                }
                maxLength={textLimit}
                onChange={handleTextChange}
                placeholder={editPostId ? "把这一条动态再润一润..." : "这一刻的想法..."}
                text={text}
              />
              <div className="mt-auto pt-6">
                <ComposerMediaPicker
                  error={mediaError}
                  maxMediaCount={socialImageUploadLimit}
                  media={media}
                  onFileChange={handleMediaFileChange}
                  onOpenPicker={() => undefined}
                  onRemove={handleRemoveMedia}
                  onRetry={handleRetryMediaUpload}
                  uploadStateById={editPostId ? mediaUploadStateById : failedMediaUploadStateById}
                />
              </div>
            </div>
          </div>

          <div className="client-app-gutter fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+112px)] z-[80]">
            <div className="client-app-frame">
              <ComposerSettingList>
                <ComposerSettingItem icon="location" label="所在位置" onClick={() => setView("location")} value={locationLabel} />
                <ComposerSettingItem
                  icon="mention"
                  label="提醒谁看"
                  onClick={() => setView("mentions")}
                  value={summarizeMentionCandidates(allMentionCandidates, mentionUserIds)}
                />
                <ComposerSettingItem
                  icon="visibility"
                  label="谁可以看"
                  onClick={() => setView("visibility")}
                  value={summarizeVisibility(visibility, {
                    tags: visibilityTagIds,
                    profileCount: visibilityProfileKeys.length,
                    includeRelatedPeople
                  })}
                />
                <ComposerSettingItem
                  icon="comment"
                  label="谁可以评论"
                  onClick={() => setView("comment-permission")}
                  value={summarizeCommentPermission(commentPermission)}
                />
              </ComposerSettingList>
            </div>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

function createComposerSnapshot({
  draft,
  editPost,
  fallbackPostType
}: {
  draft: SocialComposerDraft | undefined;
  editPost: SocialPost | undefined;
  fallbackPostType: SocialPostType;
}) {
  return {
    text: editPost?.text ?? draft?.text ?? "",
    media: editPost?.media ?? draft?.media ?? [],
    visibility: editPost?.visibility ?? draft?.visibility ?? "public",
    visibilityTagIds: editPost?.visibilityTagIds ?? draft?.visibilityTagIds ?? [],
    visibilityProfileKeys: editPost?.visibilityProfileKeys ?? draft?.visibilityProfileKeys ?? editPost?.audienceProfileKeys ?? draft?.audienceProfileKeys ?? [],
    includeRelatedPeople: editPost?.includeRelatedPeople ?? draft?.includeRelatedPeople ?? false,
    commentPermission: editPost?.commentPermission ?? draft?.commentPermission ?? "everyone",
    locationLabel: editPost?.locationLabel ?? draft?.locationLabel ?? "",
    mentionUserIds: editPost?.mentionUserIds ?? draft?.mentionUserIds ?? [],
    postType: editPost?.postType ?? draft?.postType ?? fallbackPostType
  };
}

function buildVisibilityTagOptions(author?: SocialProfile) {
  const explicitVisibilityTags = author?.extraProfileFields.visibilityTags;
  const rawVisibilityTags = Array.isArray(explicitVisibilityTags)
    ? explicitVisibilityTags
    : typeof explicitVisibilityTags === "string"
      ? [explicitVisibilityTags]
      : [];

  return unique(
    [
      author?.entityType === "user" ? "熟客" : author?.entityType === "technician" ? "预约客户" : "VIP客户",
      author?.location,
      author?.headline,
      ...rawVisibilityTags.filter((value): value is string => typeof value === "string")
    ]
      .flatMap((value) => String(value ?? "").split(/[、,/|]/))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 24)
  ).slice(0, 18);
}

function clampComposerSnapshotText(snapshot: ReturnType<typeof createComposerSnapshot>, limit: number) {
  return {
    ...snapshot,
    text: snapshot.text.slice(0, limit)
  };
}

function getComposerTextLimit(author?: SocialProfile) {
  const memberLevel = getComposerMemberLevel(author);
  const membership = resolveCustomerMembership(memberLevel);

  if (membership.kind === "black") {
    return blackCardComposerTextLimit;
  }

  if (membership.kind || isPaidComposerMemberLevel(memberLevel)) {
    return paidComposerTextLimit;
  }

  return freeComposerTextLimit;
}

function getComposerMemberLevel(author?: SocialProfile) {
  const rawLevel = author?.extraProfileFields.memberLevel;

  if (Array.isArray(rawLevel)) {
    return rawLevel.join(" ");
  }

  return typeof rawLevel === "string" ? rawLevel : undefined;
}

function isPaidComposerMemberLevel(memberLevel?: string) {
  const normalized = memberLevel?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return !/(free|basic|guest|none|普通|免费|免費|非会员|非會員|未开通|未開通)/.test(normalized);
}

function ComposerTypeSwitch({
  options,
  value,
  onChange
}: {
  options: Array<{ label: string; value: SocialPostType }>;
  value: SocialPostType;
  onChange: (value: SocialPostType) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] p-1">
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm font-black transition",
              active
                ? "bg-[color:var(--client-primary)] text-[#090806]"
                : "text-[color:var(--client-muted)] hover:text-[color:var(--client-text)]"
            )}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ComposerContextCard({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[26px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)]">
      <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-[color:var(--client-muted)]">
        {title}
      </div>
      {children}
    </section>
  );
}
