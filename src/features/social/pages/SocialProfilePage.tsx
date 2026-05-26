import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { coreReadApi, coreReadIdFromRoute, mapCoreShopToStore, mapCoreTechnicianToTechnician, type CoreMediaAsset, type CoreServiceCard, type CoreTechnicianDetail } from "../../core-read/api";
import { useCoreReadQuery } from "../../core-read/hooks";
import type { TechnicianRelatedShopEntry } from "../../../lib/technicianRelatedShops";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import {
  MediaLightbox,
  MediaPlayGlyph,
  getSocialMediaPreviewUrl,
  navItemsForSocialScope,
  SocialComposeFab,
  SocialEmptyState,
  SocialPostItem,
  SocialProfileHeader,
  SocialProfileSearchFab,
  SocialProfileTopBar,
  SocialProfileTabs
} from "../components/SocialUi";
import { profileKey } from "../utils";
import type { SocialMediaItem, SocialPortalScope, SocialPost, SocialProfile, SocialProfileTab } from "../types";

function formatCoreYen(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "价格待确认";
  }

  return `¥${Math.round(parsed).toLocaleString("ja-JP")}`;
}

function formatCoreRating(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value ?? "");

  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(1) : "暂无评分";
}

function coreMediaAssetType(asset: CoreMediaAsset): "image" | "video" {
  return asset.mimeType.toLowerCase().startsWith("video/") ? "video" : "image";
}

function buildCoreTechnicianSocialProfile(detail: CoreTechnicianDetail): SocialProfile {
  const technician = mapCoreTechnicianToTechnician(detail);
  const gallery = technician.gallery ?? [];
  const profileImages = gallery.length > 0 ? gallery : [technician.avatar];
  const serviceNames = detail.services
    .map((service) => service.name.trim())
    .filter(Boolean)
    .slice(0, 4);
  const serviceArea = detail.serviceArea?.trim();
  const reviewTags = [
    `★ ${formatCoreRating(detail.reviewSummary.ratingAverage)}`,
    `${detail.reviewSummary.reviewCount} 条评价`,
    ...detail.reviewSummary.highlights
  ].filter(Boolean);

  return {
    id: String(detail.id),
    entityType: "technician",
    displayName: detail.displayName,
    handle: `technician-${detail.id}`,
    avatar: technician.avatar,
    coverImage: profileImages[0],
    coverImages: profileImages,
    bio: detail.bio?.trim() || `${detail.displayName} 的公开服务主页。预约前可以先查看服务内容、媒体和可约项目。`,
    location: [serviceArea || detail.city, detail.city].filter(Boolean).join(" · "),
    joinedAt: detail.createdAt,
    verifiedStatus: "verified",
    followerCount: Math.max(0, detail.reviewSummary.reviewCount),
    followingCount: 0,
    headline: "店铺所属技师",
    extraProfileFields: {
      serviceTags: reviewTags,
      languages: ["日语", "中文"],
      bookingAction: detail.services.length > 0 ? "可预约服务" : "预约待确认",
      nextAvailability: "预约确认中",
      scheduleTechnicianId: `tech-${detail.id}`,
      serviceFocus: serviceNames
    }
  };
}

function getCorePostDate(baseDate: string, index: number) {
  const timestamp = new Date(baseDate).getTime();

  if (!Number.isFinite(timestamp)) {
    return new Date(Date.now() - index * 60 * 60 * 1000).toISOString();
  }

  return new Date(timestamp - index * 60 * 60 * 1000).toISOString();
}

function buildCoreTechnicianServicePost(service: CoreServiceCard, detail: CoreTechnicianDetail, index: number): SocialPost {
  const imageUrl = service.coverUrl ?? service.shop.coverUrl;
  const categoryName = service.category.nameJa ?? service.category.nameEn ?? service.category.name;
  const text = [
    service.name,
    service.description?.trim() || `${categoryName} · ${service.city}`,
    `${service.durationMinutes} 分钟 · ${formatCoreYen(service.priceAmount)} · ${service.shop.name}`
  ].join("\n\n");

  return {
    id: `service-${service.id}`,
    authorId: String(detail.id),
    authorType: "technician",
    text,
    media: imageUrl
      ? [
          {
            id: `service-${service.id}-cover`,
            type: "image",
            url: imageUrl,
            alt: service.name
          }
        ]
      : [],
    hashtags: [categoryName, service.city].filter(Boolean),
    mentions: [],
    createdAt: getCorePostDate(detail.updatedAt ?? detail.createdAt, index),
    updatedAt: detail.updatedAt,
    likeCount: Math.max(0, service.reviewSummary.reviewCount),
    replyCount: 0,
    repostCount: 0,
    viewCount: Math.max(0, service.reviewSummary.reviewCount * 5),
    bookmarkCount: 0,
    isPinned: index === 0,
    visibility: "public",
    status: "published",
    postType: "technician-daily",
    locationLabel: service.city
  };
}

function buildCoreTechnicianMediaPost(asset: CoreMediaAsset, detail: CoreTechnicianDetail, index: number): SocialPost {
  const mediaType = coreMediaAssetType(asset);

  return {
    id: `media-${asset.id}`,
    authorId: String(detail.id),
    authorType: "technician",
    text: asset.altText?.trim() || "服务现场记录。预约前可以先看现场图、服务风格和可约项目。",
    media: [
      {
        id: `media-${asset.id}-asset`,
        type: mediaType,
        url: asset.url,
        alt: asset.altText ?? undefined
      }
    ],
    hashtags: ["服务现场", detail.city].filter(Boolean),
    mentions: [],
    createdAt: getCorePostDate(detail.updatedAt ?? detail.createdAt, detail.services.length + index),
    updatedAt: detail.updatedAt,
    likeCount: Math.max(0, Math.round(detail.reviewSummary.reviewCount / 2)),
    replyCount: 0,
    repostCount: 0,
    viewCount: Math.max(0, detail.reviewSummary.reviewCount * 4),
    bookmarkCount: 0,
    isPinned: false,
    visibility: "public",
    status: "published",
    postType: "technician-daily",
    locationLabel: detail.city
  };
}

function buildCoreTechnicianSocialPosts(detail: CoreTechnicianDetail): SocialPost[] {
  return [
    ...detail.services.map((service, index) => buildCoreTechnicianServicePost(service, detail, index)),
    ...detail.mediaAssets.map((asset, index) => buildCoreTechnicianMediaPost(asset, detail, index))
  ];
}

function buildCoreTechnicianRelatedShopEntries(detail: CoreTechnicianDetail): TechnicianRelatedShopEntry[] {
  const seenShopIds = new Set<number>();
  const shops = detail.services
    .map((service) => service.shop)
    .filter((shop) => {
      if (seenShopIds.has(shop.id)) {
        return false;
      }

      seenShopIds.add(shop.id);
      return true;
    });

  return shops.map((shop, index) => ({
    store: mapCoreShopToStore(shop),
    relationType: index === 0 ? "main" : "support",
    relationLabel: index === 0 ? "所属店铺" : "协作店铺",
    bookingEnabled: true,
    priority: index
  }));
}

function CoreReadTechnicianProfileStatus({
  description,
  scope,
  title
}: {
  description: string;
  scope: SocialPortalScope;
  title: string;
}) {
  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar subtitle="技师主页" title={title} />
      <SocialEmptyState
        action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态首页</PrimaryButton>}
        description={description}
        title={title}
      />
    </PageScaffold>
  );
}

function CoreReadTechnicianSocialProfileScene({
  actorKey,
  onClose,
  posts,
  profile,
  relatedShopEntries,
  scope
}: {
  actorKey: string;
  onClose: () => void;
  posts: SocialPost[];
  profile: SocialProfile;
  relatedShopEntries: TechnicianRelatedShopEntry[];
  scope: SocialPortalScope;
}) {
  const [tab, setTab] = useState<SocialProfileTab>("posts");
  const profileOverrides = useMemo(() => ({ [profileKey(profile)]: profile }), [profile]);
  const postCount = useMemo(() => posts.filter((post) => !post.replyToPostId).length, [posts]);

  useEffect(() => {
    setTab("posts");
  }, [profile.id]);

  const visiblePosts = useMemo(() => {
    if (tab === "posts") {
      return posts.filter((post) => !post.replyToPostId);
    }

    if (tab === "media") {
      return posts.filter((post) => post.media.length > 0);
    }

    if (tab === "replies") {
      return posts.filter((post) => post.replyToPostId);
    }

    return [];
  }, [posts, tab]);

  return (
    <PageScaffold contentClassName="space-y-0 pb-32 pt-0" navItems={navItemsForSocialScope(scope)} showTopEdgeMask={false}>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <SocialProfileTopBar onClose={onClose} postCount={postCount} profile={profile} scope={scope} />
      </div>

      <div>
        <SocialProfileHeader actorKey={actorKey} profile={profile} relatedShopEntries={relatedShopEntries} scope={scope} />
        <div className="-mx-4 px-3 py-3 sm:-mx-6 sm:px-4 lg:-mx-8">
          <SocialProfileTabs onChange={setTab} value={tab} />
        </div>
      </div>

      <section className="overflow-hidden border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]">
        {visiblePosts.length > 0 ? (
          visiblePosts.map((post) => (
            <SocialPostItem
              actorKey={actorKey}
              disableDetailNavigation
              key={post.id}
              post={post}
              profileOverrides={profileOverrides}
              scope={scope}
            />
          ))
        ) : (
          <div className="p-4">
            <SocialEmptyState
              description={tab === "media" ? "当前技师还没有公开媒体内容。" : "当前技师还没有公开动态内容。"}
              title="这里还没有内容"
            />
          </div>
        )}
      </section>

      <SocialProfileSearchFab scope={scope} />
    </PageScaffold>
  );
}

function CoreReadTechnicianSocialProfilePage({
  actorKey,
  id,
  onClose,
  scope
}: {
  actorKey: string;
  id: number;
  onClose: () => void;
  scope: SocialPortalScope;
}) {
  const query = useCoreReadQuery(() => coreReadApi.getTechnicianDetail(id), [id]);
  const profile = useMemo(() => (query.data ? buildCoreTechnicianSocialProfile(query.data) : null), [query.data]);
  const posts = useMemo(() => (query.data ? buildCoreTechnicianSocialPosts(query.data) : []), [query.data]);
  const relatedShopEntries = useMemo(() => (query.data ? buildCoreTechnicianRelatedShopEntries(query.data) : []), [query.data]);

  if (query.loading) {
    return <CoreReadTechnicianProfileStatus description="正在载入当前技师的动态主页。" scope={scope} title="正在载入技师" />;
  }

  if (query.error) {
    return <CoreReadTechnicianProfileStatus description={query.error} scope={scope} title="技师主页读取失败" />;
  }

  if (!profile) {
    return <CoreReadTechnicianProfileStatus description="当前技师暂时没有公开主页。" scope={scope} title="暂无技师主页" />;
  }

  return (
    <CoreReadTechnicianSocialProfileScene
      actorKey={actorKey}
      onClose={onClose}
      posts={posts}
      profile={profile}
      relatedShopEntries={relatedShopEntries}
      scope={scope}
    />
  );
}

function SocialProfileUnavailable({ scope, title }: { scope: SocialPortalScope; title: string }) {
  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar subtitle="资料已不存在" title={title} />
      <SocialEmptyState
        action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态首页</PrimaryButton>}
        description="当前资料链接不可用，或者对应身份还没有进入统一 social profile 模块。"
        title="资料页不存在"
      />
    </PageScaffold>
  );
}

function SocialProfileScene({
  actorKey,
  onClose,
  profile,
  resetKey,
  scope
}: {
  actorKey: string;
  onClose: () => void;
  profile: SocialProfile;
  resetKey: string;
  scope: SocialPortalScope;
}) {
  const { getFollowers, getFollowing, getPostById, getProfilePosts } = useSocial();
  const [tab, setTab] = useState<SocialProfileTab>("posts");
  const [lightbox, setLightbox] = useState<{ media: SocialMediaItem[]; index: number } | null>(null);
  const isSelf = profileKey(profile) === actorKey;

  useEffect(() => {
    setTab("posts");
  }, [resetKey]);

  const postCount = useMemo(() => (profile ? getProfilePosts(profileKey(profile), "posts", actorKey).length : 0), [actorKey, getProfilePosts, profile]);
  const rawList = useMemo(() => (profile ? getProfilePosts(profileKey(profile), tab, actorKey) : []), [actorKey, getProfilePosts, profile, tab]);
  const pinnedPost = profile?.pinnedPostId ? getPostById(profile.pinnedPostId, actorKey) : undefined;
  const list = useMemo(
    () => (tab === "posts" && pinnedPost ? rawList.filter((post) => post.id !== pinnedPost.id) : rawList),
    [pinnedPost, rawList, tab]
  );
  const followerPreview = profile ? getFollowers(profileKey(profile)).slice(0, 3) : [];
  const followingPreview = profile ? getFollowing(profileKey(profile)).slice(0, 3) : [];
  const mediaTiles = useMemo(
    () =>
      rawList.flatMap((post) =>
        post.media.map((media, index) => ({
          post,
          media,
          index
        }))
      ),
    [rawList]
  );
  return (
    <PageScaffold contentClassName="space-y-0 pb-32 pt-0" navItems={navItemsForSocialScope(scope)} showTopEdgeMask={false}>
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <SocialProfileTopBar onClose={onClose} postCount={postCount} profile={profile} scope={scope} />
      </div>

      <div>
        <SocialProfileHeader actorKey={actorKey} profile={profile} scope={scope} />
        <div className="-mx-4 px-3 py-3 sm:-mx-6 sm:px-4 lg:-mx-8">
          <SocialProfileTabs onChange={setTab} value={tab} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="overflow-hidden border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)]">
            {tab === "posts" && pinnedPost ? (
              <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]">
                <div className="px-4 py-3 text-xs font-semibold text-[color:var(--client-muted)] sm:px-5">置顶动态</div>
                <SocialPostItem actorKey={actorKey} post={pinnedPost} scope={scope} />
              </div>
            ) : null}

            {tab === "media" ? (
              mediaTiles.length > 0 ? (
                <div className="grid gap-1 p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {mediaTiles.map(({ post, media, index }) => (
                    <button
                      className="group relative block overflow-hidden border-0 bg-black p-0 text-left"
                      key={`${post.id}-${media.id}`}
                      onClick={() => setLightbox({ media: post.media, index })}
                      type="button"
                    >
                      {media.type === "video" ? (
                        <>
                          <video className="h-[220px] w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" muted poster={media.thumbnailUrl ? getSocialMediaPreviewUrl({ url: media.thumbnailUrl }) : undefined} src={media.url} />
                          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-black text-white">视频</span>
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="grid h-11 w-11 place-items-center rounded-full bg-black/58 text-white">
                              <MediaPlayGlyph className="ml-0.5 h-4 w-4" />
                            </span>
                          </span>
                        </>
                      ) : (
                        <img alt={media.alt ?? ""} className="h-[220px] w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" src={getSocialMediaPreviewUrl(media)} />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4">
                  <SocialEmptyState
                    action={<PrimaryButton to={socialPaths.compose(scope, { author: profileKey(profile) })}>发布媒体动态</PrimaryButton>}
                    description="这个主页还没有公开媒体内容。图片和视频会在这里统一汇总。"
                    title="媒体区还是空的"
                  />
                </div>
              )
            ) : list.length > 0 ? (
              list.map((post) => <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />)
            ) : (
              <div className="p-4">
                <SocialEmptyState
                  action={<PrimaryButton to={socialPaths.compose(scope, { author: profileKey(profile) })}>发表动态</PrimaryButton>}
                  description="当前 tab 还没有内容。你可以切到其他 tab，或者直接从这里发布新的公开动态。"
                  title="这里还没有内容"
                />
              </div>
            )}
            {lightbox ? (
              <MediaLightbox
                activeIndex={lightbox.index}
                media={lightbox.media}
                onChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
                onClose={() => setLightbox(null)}
              />
            ) : null}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="space-y-4 xl:sticky" style={{ top: "calc(env(safe-area-inset-top) + 92px)" }}>
            <SurfacePanel className="space-y-4">
              <h2 className="text-lg font-black text-[color:var(--client-text)]">关系预览</h2>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-[color:var(--client-text)]">粉丝</h3>
                    <Link className="text-sm font-semibold text-[color:var(--client-primary)]" to={socialPaths.followers(scope, profile)}>
                      查看全部
                    </Link>
                  </div>
                  {followerPreview.length > 0 ? (
                    followerPreview.map((item) => (
                      <Link className="flex items-center gap-3 rounded-[18px] px-2 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]" key={profileKey(item)} to={socialPaths.profile(scope, item)}>
                        <AvatarImage alt={item.displayName} className="h-10 w-10" src={item.avatar} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[color:var(--client-text)]">{item.displayName}</p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--client-muted)]">暂无粉丝预览</p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-[color:var(--client-text)]">关注中</h3>
                    <Link className="text-sm font-semibold text-[color:var(--client-primary)]" to={socialPaths.following(scope, profile)}>
                      查看全部
                    </Link>
                  </div>
                  {followingPreview.length > 0 ? (
                    followingPreview.map((item) => (
                      <Link className="flex items-center gap-3 rounded-[18px] px-2 py-2 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)]" key={profileKey(item)} to={socialPaths.profile(scope, item)}>
                        <AvatarImage alt={item.displayName} className="h-10 w-10" src={item.avatar} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[color:var(--client-text)]">{item.displayName}</p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-[color:var(--client-muted)]">暂无关注预览</p>
                  )}
                </div>
              </div>
            </SurfacePanel>
          </div>
        </aside>
      </div>

      <SocialProfileSearchFab raised={isSelf} scope={scope} />
      {isSelf ? <SocialComposeFab scope={scope} /> : null}
    </PageScaffold>
  );
}

function getProfileCloseFallback(scope: SocialPortalScope) {
  if (scope === "merchant") {
    return "/merchant/contacts";
  }

  if (scope === "technician") {
    return "/technician/contacts";
  }

  return "/contacts";
}

function canNavigateBackFromProfile(locationKey: string) {
  if (typeof window === "undefined") {
    return locationKey !== "default";
  }

  const historyState = window.history.state as { idx?: number } | null;
  return typeof historyState?.idx === "number" ? historyState.idx > 0 : locationKey !== "default";
}

export function SocialProfilePage() {
  const { entityType, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { profiles, getActorForScope } = useSocial();
  const actorKey = getActorForScope(scope);
  const profile = entityType && id ? profiles[`${entityType}:${id}`] : undefined;
  const coreTechnicianId = entityType === "technician" ? coreReadIdFromRoute(id) : null;
  const closeProfile = () => {
    if (canNavigateBackFromProfile(location.key)) {
      navigate(-1);
      return;
    }

    navigate(getProfileCloseFallback(scope), { replace: true });
  };

  if (!profile && coreTechnicianId) {
    return <CoreReadTechnicianSocialProfilePage actorKey={actorKey} id={coreTechnicianId} onClose={closeProfile} scope={scope} />;
  }

  if (!profile) {
    return <SocialProfileUnavailable scope={scope} title="资料页" />;
  }

  return <SocialProfileScene actorKey={actorKey} onClose={closeProfile} profile={profile} resetKey={`${entityType}:${id}`} scope={scope} />;
}

export function SocialSelfProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { profiles, getActorForScope } = useSocial();
  const actorKey = getActorForScope(scope);
  const profile = profiles[actorKey];
  const closeProfile = () => {
    if (canNavigateBackFromProfile(location.key)) {
      navigate(-1);
      return;
    }

    navigate(socialPaths.timeline(scope), { replace: true });
  };

  if (!profile) {
    return <SocialProfileUnavailable scope={scope} title="我的主页" />;
  }

  return <SocialProfileScene actorKey={actorKey} onClose={closeProfile} profile={profile} resetKey={actorKey} scope={scope} />;
}
