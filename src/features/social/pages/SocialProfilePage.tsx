import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../../components/ui/AvatarImage";
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
import type { SocialMediaItem, SocialPortalScope, SocialProfile, SocialProfileTab } from "../types";

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
  const pinnedPost = profile?.pinnedPostId ? getPostById(profile.pinnedPostId) : undefined;
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
  const closeProfile = () => {
    if (canNavigateBackFromProfile(location.key)) {
      navigate(-1);
      return;
    }

    navigate(getProfileCloseFallback(scope), { replace: true });
  };

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
