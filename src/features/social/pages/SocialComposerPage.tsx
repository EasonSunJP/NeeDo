import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MobileShell } from "../../../components/mobile/MobileShell";
import { cn } from "../../../lib/utils";
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
  summarizeAudience,
  summarizeCommentPermission,
  summarizeVisibility
} from "../components/UnifiedComposerUi";
import { SocialPostItem } from "../components/SocialUi";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import type { SocialCommentPermission, SocialComposerDraft, SocialPost, SocialPostType, SocialProfile, SocialVisibility } from "../types";
import {
  createMediaFromFile,
  isValidSocialPostMediaSet,
  profileMentionLabel,
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
  const replyToPostId = searchParams.get("replyToPostId") ?? undefined;
  const editPostId = searchParams.get("editPostId") ?? undefined;
  const draftKey = `composer:${scope}:${editPostId ?? replyToPostId ?? quotePostId ?? "root"}`;
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
  const replyPost = replyToPostId ? getPostById(replyToPostId, initialAuthorKey) : undefined;
  const author = profiles[initialAuthorKey];
  const textLimit = useMemo(() => getComposerTextLimit(author), [author]);

  const postTypeOptions = useMemo<Array<{ label: string; value: SocialPostType }>>(() => {
    if (replyToPostId) {
      return [{ label: "回复", value: "reply" }];
    }

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
  }, [author?.entityType, quotePostId, replyToPostId]);

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
  const [audienceProfileKeys, setAudienceProfileKeys] = useState<string[]>(initialComposerState.audienceProfileKeys);
  const [mentionQuery, setMentionQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [postType, setPostType] = useState<SocialPostType>(initialComposerState.postType);
  const [mediaError, setMediaError] = useState("");

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
    setView("composer");
    setText(nextSnapshot.text);
    setMedia(nextSnapshot.media);
    setVisibility(nextSnapshot.visibility);
    setVisibilityTagIds(nextSnapshot.visibilityTagIds);
    setVisibilityProfileKeys(nextSnapshot.visibilityProfileKeys);
    setIncludeRelatedPeople(nextSnapshot.includeRelatedPeople);
    setCommentPermission(nextSnapshot.commentPermission);
    setLocationLabel(nextSnapshot.locationLabel);
    setAudienceProfileKeys(nextSnapshot.audienceProfileKeys);
    setPostType(nextSnapshot.postType);
    setMediaError("");
    setMentionQuery("");
    setLocationQuery("");
  }, [draftKey, editPost?.id, initialAuthorKey, postTypeOptions, quotePostId, replyToPostId, selectedAuthorFromQuery, textLimit]);

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
        audienceProfileKeys: initialSnapshot.audienceProfileKeys,
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
        audienceProfileKeys,
        postType
      }),
    [audienceProfileKeys, commentPermission, includeRelatedPeople, locationLabel, media, postType, text, visibility, visibilityProfileKeys, visibilityTagIds]
  );
  const isDirty = currentSignature !== initialSignature;
  const hasValidMediaSet = isValidSocialPostMediaSet(media);
  const canPublish = (text.trim().length > 0 || media.length > 0) && hasValidMediaSet;
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
      audienceProfileKeys.length > 0 ||
      postType !== (postTypeOptions[0]?.value ?? "post");

    if (!hasDraftContent) {
      clearDraft(draftKey);
      return;
    }

    saveDraft(draftKey, {
      authorKey: initialAuthorKey,
      text,
      media,
      quotePostId,
      replyToPostId,
      editPostId,
      postType,
      visibility,
      visibilityTagIds,
      visibilityProfileKeys,
      includeRelatedPeople,
      commentPermission,
      locationLabel,
      audienceProfileKeys,
      updatedAt: new Date().toISOString()
    });
  }, [
    audienceProfileKeys,
    clearDraft,
    commentPermission,
    draftKey,
    editPostId,
    includeRelatedPeople,
    initialAuthorKey,
    locationLabel,
    media,
    postType,
    postTypeOptions,
    quotePostId,
    replyToPostId,
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

  const mentionCandidates = useMemo(() => {
    const normalized = mentionQuery.trim().toLowerCase();

    return profileList
      .filter((profile) => profileKey(profile) !== initialAuthorKey)
      .filter((profile) => {
        if (!normalized) {
          return true;
        }

        return (
          profile.displayName.toLowerCase().includes(normalized) ||
          profile.bio.toLowerCase().includes(normalized)
        );
      })
      .slice(0, 18);
  }, [initialAuthorKey, mentionQuery, profileList]);

  const locationOptions = useMemo(() => {
    const normalized = locationQuery.trim().toLowerCase();
    const baseOptions = unique(
      [
        author?.location,
        "东京 银座",
        "东京 新宿",
        "东京 涩谷",
        "东京 六本木",
        "东京 品川",
        "横滨 关内",
        "大阪 梅田"
      ].filter((item): item is string => Boolean(item))
    );
    const filtered = baseOptions.filter((item) => !normalized || item.toLowerCase().includes(normalized));

    if (locationQuery.trim() && !filtered.includes(locationQuery.trim())) {
      filtered.unshift(locationQuery.trim());
    }

    return filtered.slice(0, 8);
  }, [author?.location, locationQuery]);

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

  const handlePublish = async () => {
    if (!canPublish || !author) {
      if (!hasValidMediaSet) {
        setMediaError("一条动态最多发布 9 张图片，或 1 个视频。");
      }

      return;
    }

    setIsPublishing(true);
    await new Promise((resolve) => window.setTimeout(resolve, 260));

    const nextPost = editPostId
      ? updatePost({
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
          audienceProfileKeys,
          postType: editPost?.postType ?? postType
        })
      : createPost({
          authorKey: initialAuthorKey,
          media,
          quotePostId,
          replyToPostId,
          text,
          visibility,
          visibilityTagIds,
          visibilityProfileKeys,
          includeRelatedPeople,
          commentPermission,
          locationLabel: locationLabel || undefined,
          audienceProfileKeys,
          postType
        });

    clearDraft(draftKey);
    setIsPublishing(false);

    if (nextPost) {
      navigate(socialPaths.timeline(scope), { replace: true });
    }
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
            onBack={() => setView("composer")}
            onQueryChange={setMentionQuery}
            onToggle={(value) =>
              setAudienceProfileKeys((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))
            }
            profiles={mentionCandidates}
            query={mentionQuery}
            selectedKeys={audienceProfileKeys}
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
            publishLabel={editPostId ? "保存" : replyPost ? "回复" : "发表"}
          />

          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+392px)] top-[calc(env(safe-area-inset-top)+88px)] z-20 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
            <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
              <ComposerTextArea
                author={author}
                authorTo={author ? socialPaths.profile(scope, author) : undefined}
                hint={detectedLink ? `已检测到链接：${detectedLink}` : undefined}
                leading={
                  postTypeOptions.length > 1 || replyPost || quotePost ? (
                    <div className="space-y-3">
                      {postTypeOptions.length > 1 ? <ComposerTypeSwitch onChange={setPostType} options={postTypeOptions} value={postType} /> : null}
                      {replyPost ? (
                        <ComposerContextCard title={`正在回复 ${profileMentionLabel(profiles[profileKey({ entityType: replyPost.authorType, id: replyPost.authorId })])}`}>
                          <SocialPostItem actorKey={initialAuthorKey} compact hideActions post={replyPost} scope={scope} />
                        </ComposerContextCard>
                      ) : null}
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
                placeholder={replyPost ? "继续回复这条动态..." : editPostId ? "把这一条动态再润一润..." : "这一刻的想法..."}
                text={text}
              />
              <div className="mt-auto pt-6">
                <ComposerMediaPicker
                  error={mediaError}
                  maxMediaCount={socialImageUploadLimit}
                  media={media}
                  onFileChange={(event) => {
                    const input = event.currentTarget;
                    const files = Array.from(event.target.files ?? []);
                    const selectedVideo = files.find((file) => file.type.startsWith("video/"));

                    if (selectedVideo) {
                      if (media.length > 0) {
                        setMediaError("视频动态不能同时上传图片，请先移除已有媒体。");
                        input.value = "";
                        return;
                      }

                      setMedia([createMediaFromFile(selectedVideo)]);
                      setMediaError(files.length > 1 ? "已保留 1 个视频，视频动态不能同时上传图片。" : "");
                      input.value = "";
                      return;
                    }

                    const remainingSlots = Math.max(0, socialImageUploadLimit - media.length);
                    const nextMedia = files.slice(0, remainingSlots).map((file) => createMediaFromFile(file));
                    setMedia((current) => [...current.filter((item) => item.type === "image"), ...nextMedia]);
                    setMediaError(files.length > remainingSlots ? "已达到 9 张图片上限，超出的图片没有加入。" : "");
                    input.value = "";
                  }}
                  onOpenPicker={() => undefined}
                  onRemove={(mediaId) => {
                    setMedia((current) => current.filter((item) => item.id !== mediaId));
                    setMediaError("");
                  }}
                />
              </div>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+112px)] z-[80] px-4 sm:px-6">
            <div className="mx-auto w-full max-w-[720px]">
              <ComposerSettingList>
                <ComposerSettingItem icon="location" label="所在位置" onClick={() => setView("location")} value={locationLabel} />
                <ComposerSettingItem
                  icon="mention"
                  label="提醒谁看"
                  onClick={() => setView("mentions")}
                  value={summarizeAudience(profileList, audienceProfileKeys)}
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
    audienceProfileKeys: editPost?.audienceProfileKeys ?? draft?.audienceProfileKeys ?? [],
    postType: editPost?.postType ?? draft?.postType ?? fallbackPostType
  };
}

function buildVisibilityTagOptions(author?: SocialProfile) {
  const rawValues = Object.values(author?.extraProfileFields ?? {}).flatMap((value) => Array.isArray(value) ? value : [value]);

  return unique(
    [
      author?.entityType === "user" ? "熟客" : author?.entityType === "technician" ? "预约客户" : "VIP客户",
      author?.location,
      author?.headline,
      ...rawValues.filter((value): value is string => typeof value === "string")
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
