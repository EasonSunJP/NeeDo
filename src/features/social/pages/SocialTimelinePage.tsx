import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FeatureCarousel, type FeatureCarouselSlide } from "../../../components/client-ui/FeatureCarousel";
import { PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { FloatingHeaderSearchBar } from "../../../components/mobile/FloatingHeaderSearchBar";
import {
  FloatingHomeHeader,
  floatingHeaderGlassPanelClassName,
  floatingHeaderInnerClassName
} from "../../../components/mobile/FloatingHomeHeader";
import { SharedHomeHeader } from "../../../components/mobile/SharedHomeHeader";
import { roleBasedTabConfig } from "../../../components/mobile/navItems";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { getLocationAreaHints } from "../../../lib/location";
import { cn } from "../../../lib/utils";
import { getResolvedCarouselSlides, resolveCarouselTargetPath, useCarouselStore } from "../../../state/homeCarouselStore";
import { useHomeLayoutStore } from "../../../state/homeLayoutStore";
import { useHomeLocationPreference, type HomeLocationPreferenceState } from "../../../state/homeLocationStore";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { type SocialTimelineLocationContext } from "../timeline";
import {
  navItemsForSocialScope,
  NotificationRow,
  SocialComposeFab,
  SocialEmptyState,
  SocialFollowButton,
  SocialPostItem,
  SocialProfileSummaryCard,
  SocialTimelineFilterTabs,
  SocialSidebarSection
} from "../components/SocialUi";
import { profileKey } from "../utils";
import type { SocialPortalScope, SocialProfile, SocialProfileTab, SocialTimelineFilterTab } from "../types";

type TimelinePanelStatus = "idle" | "loading" | "ready" | "error";

type TimelinePanelState = {
  status: TimelinePanelStatus;
  note?: string;
  errorMessage?: string;
  locationContext?: SocialTimelineLocationContext;
  visibleCountByTab: Record<SocialProfileTab, number>;
};

function SocialTimelineHeaderSearch({ to }: { to: string }) {
  return (
    <FloatingHeaderSearchBar
      actionAriaLabel="开始搜索动态"
      fieldAriaLabel="搜索动态内容"
      placeholder="搜索 @用户、#话题、动态内容"
      to={to}
    />
  );
}

function getSocialProfileTextField(profile: SocialProfile | undefined, key: string) {
  const value = profile?.extraProfileFields[key];

  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" / ") || undefined;
  }

  if (typeof value === "boolean") {
    return value ? "是" : undefined;
  }

  return value ? `${value}` : undefined;
}

function createVisibleCountByTab(): Record<SocialProfileTab, number> {
  return {
    posts: 10,
    replies: 10,
    media: 10,
    likes: 10
  };
}

function createInitialTimelinePanels(nearbyPanel?: Pick<TimelinePanelState, "note" | "locationContext">): Record<SocialTimelineFilterTab, TimelinePanelState> {
  return {
    nearby: {
      status: "ready",
      note: nearbyPanel?.note,
      locationContext: nearbyPanel?.locationContext,
      visibleCountByTab: createVisibleCountByTab()
    },
    friends: {
      status: "ready",
      visibleCountByTab: createVisibleCountByTab()
    },
    mine: {
      status: "ready",
      visibleCountByTab: createVisibleCountByTab()
    }
  };
}

function timelineFilterStorageKey(scope: SocialPortalScope) {
  return `needo.social.timeline.filter.${scope}`;
}

function readStoredTimelineFilter(scope: SocialPortalScope): SocialTimelineFilterTab {
  if (typeof window === "undefined") {
    return "nearby";
  }

  const raw = window.localStorage.getItem(timelineFilterStorageKey(scope));

  return raw === "nearby" || raw === "friends" || raw === "mine" ? raw : "nearby";
}

function createNearbyPanelFromHomeLocation(
  selectedLocation: ReturnType<typeof useHomeLayoutStore>["config"]["locations"][number] | undefined,
  preference: HomeLocationPreferenceState
): Pick<TimelinePanelState, "note" | "locationContext"> {
  const areaHints = getLocationAreaHints(selectedLocation);
  const locationContext: SocialTimelineLocationContext = {
    ...(preference.source === "device" && preference.coordinates ? { coords: preference.coordinates } : {}),
    ...(areaHints.length > 0 ? { areaHints } : {})
  };
  const locationLabel = selectedLocation?.label ?? "首页服务区域";
  const note =
    preference.source === "device" && preference.promptStatus === "granted"
      ? `已按首页定位 ${locationLabel} 筛选附近动态。`
      : `已按首页服务区域 ${locationLabel} 筛选附近动态。`;

  return {
    note,
    locationContext
  };
}

function getEmptyStateCopy(filter: SocialTimelineFilterTab, tab: SocialProfileTab, panel: TimelinePanelState) {
  if (filter === "nearby") {
    if (tab === "replies") {
      return {
        title: "附近还没有回复动态",
        description: "附近范围内的回复内容会在这里出现。"
      };
    }

    if (tab === "likes") {
      return {
        title: "附近还没有喜欢内容",
        description: "你在附近动态里点过赞的内容会显示在这里。"
      };
    }

    if (tab === "media") {
      return {
        title: "附近还没有媒体动态",
        description: "附近范围内带图或视频的动态会显示在这里。"
      };
    }

    return {
      title: "附近还没有动态",
      description: panel.note ? `${panel.note} 当前范围内暂时没有可展示的动态。` : "开启定位后，这里会优先显示你附近范围内的动态。"
    };
  }

  if (filter === "friends") {
    if (tab === "replies") {
      return {
        title: "好友还没有回复动态",
        description: "只有互相关注好友发出的回复会显示在这里。"
      };
    }

    if (tab === "likes") {
      return {
        title: "好友范围内还没有喜欢内容",
        description: "你点赞过的好友动态会显示在这里。"
      };
    }

    if (tab === "media") {
      return {
        title: "好友还没有媒体动态",
        description: "好友发布的图片和视频会显示在这里。"
      };
    }

    return {
      title: "好友还没有发布动态",
      description: "这里只显示互相关注好友发布的内容。"
    };
  }

  if (tab === "replies") {
    return {
      title: "你还没有回复内容",
      description: "当前登录账号发出的回复会显示在这里。"
    };
  }

  if (tab === "likes") {
    return {
      title: "当前筛选下还没有喜欢内容",
      description: "当前登录账号在这一筛选范围内点赞过的动态会显示在这里。"
    };
  }

  if (tab === "media") {
    return {
      title: "你还没有发布媒体动态",
      description: "当前登录账号发布的图片和视频会显示在这里。"
    };
  }

  return {
    title: "你还没有发布动态",
    description: "这里只显示当前登录账号自己发布的内容。"
  };
}

export function SocialTimelinePage({ embedded = false }: { embedded?: boolean } = {}) {
  const location = useLocation();
  const scope = getSocialScopeFromPathname(location.pathname);
  const {
    profiles,
    profileList,
    getActorForScope,
    getPostById,
    getTimelineFeed,
    getTrendingTags,
    getNotifications,
    getFollowing,
    refreshFeeds
  } = useSocial();
  const actorKey = getActorForScope(scope);
  const actor = profiles[actorKey];
  const portalConfig = roleBasedTabConfig[scope];
  const { config: homeLocationConfig } = useHomeLayoutStore();
  const { scenes: carouselScenes, revision: carouselRevision } = useCarouselStore();
  const { state: homeLocationPreference } = useHomeLocationPreference();
  const selectedHomeLocation =
    homeLocationConfig.locations.find((item) => item.id === homeLocationConfig.selectedLocationId) ?? homeLocationConfig.locations[0];
  const homeNearbyPanel = useMemo(
    () => createNearbyPanelFromHomeLocation(selectedHomeLocation, homeLocationPreference),
    [
      homeLocationPreference.coordinates?.lat,
      homeLocationPreference.coordinates?.lng,
      homeLocationPreference.promptStatus,
      homeLocationPreference.source,
      selectedHomeLocation
    ]
  );
  const [timelineFilter, setTimelineFilter] = useState<SocialTimelineFilterTab>(() => readStoredTimelineFilter(scope));
  const [panelStates, setPanelStates] = useState<Record<SocialTimelineFilterTab, TimelinePanelState>>(() => createInitialTimelinePanels(homeNearbyPanel));
  const [pullDistance, setPullDistance] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const currentPanel = panelStates[timelineFilter];
  const filteredTimelinePosts = useMemo(() => {
    if (timelineFilter === "nearby" && currentPanel.status !== "ready") {
      return [];
    }

    return getTimelineFeed(timelineFilter, actorKey, timelineFilter === "nearby" ? currentPanel.locationContext : undefined);
  }, [actorKey, currentPanel.locationContext, currentPanel.status, getTimelineFeed, timelineFilter]);
  const rawTimelinePosts = useMemo(() => filteredTimelinePosts.filter((post) => !post.replyToPostId), [filteredTimelinePosts]);
  const pinnedPost = timelineFilter === "mine" && actor?.pinnedPostId ? getPostById(actor.pinnedPostId, actorKey) : undefined;
  const renderedPosts = useMemo(() => (pinnedPost ? rawTimelinePosts.filter((post) => post.id !== pinnedPost.id) : rawTimelinePosts), [pinnedPost, rawTimelinePosts]);
  const visibleCount = currentPanel.visibleCountByTab.posts;
  const visiblePosts = renderedPosts.slice(0, visibleCount);
  const trendingTags = getTrendingTags().slice(0, 6);
  const notifications = getNotifications(actorKey).slice(0, 3);
  const followingKeys = useMemo(() => new Set(getFollowing(actorKey).map((profile) => profileKey(profile))), [actorKey, getFollowing]);
  const timelineCarouselSlides = useMemo<FeatureCarouselSlide[]>(
    () =>
      getResolvedCarouselSlides("timeline", new Date(), carouselScenes.timeline)
        .filter((slide) => slide.status === "active")
        .map((slide) => ({
          id: slide.id,
          badge: slide.badge,
          title: slide.title,
          caption: slide.caption,
          cta: slide.cta,
          image: slide.image,
          to: resolveCarouselTargetPath(slide.target, scope)
        })),
    [carouselRevision, carouselScenes.timeline, scope]
  );
  const suggestionProfiles = useMemo(
    () =>
      profileList
        .filter((profile) => profileKey(profile) !== actorKey && !followingKeys.has(profileKey(profile)))
        .slice(0, 3),
    [actorKey, followingKeys, profileList]
  );

  useEffect(() => {
    setTimelineFilter(readStoredTimelineFilter(scope));
    setPanelStates(createInitialTimelinePanels(homeNearbyPanel));
  }, [scope]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(timelineFilterStorageKey(scope), timelineFilter);
  }, [scope, timelineFilter]);

  useEffect(() => {
    setPanelStates((current) => {
      const nearby = current.nearby;

      if (nearby.status === "ready" && nearby.note === homeNearbyPanel.note && nearby.locationContext === homeNearbyPanel.locationContext) {
        return current;
      }

      return {
        ...current,
        nearby: {
          ...nearby,
          status: "ready",
          note: homeNearbyPanel.note,
          errorMessage: undefined,
          locationContext: homeNearbyPanel.locationContext
        }
      };
    });
  }, [homeNearbyPanel]);

  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node || currentPanel.status !== "ready") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPanelStates((current) => {
            const panel = current[timelineFilter];
            const currentVisibleCount = panel.visibleCountByTab.posts;
            const nextVisibleCount = Math.min(renderedPosts.length, currentVisibleCount + 6);

            if (nextVisibleCount === currentVisibleCount) {
              return current;
            }

            return {
              ...current,
              [timelineFilter]: {
                ...panel,
                visibleCountByTab: {
                  ...panel.visibleCountByTab,
                  posts: nextVisibleCount
                }
              }
            };
          });
        }
      },
      { rootMargin: "260px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [currentPanel.status, renderedPosts.length, timelineFilter]);

  const handleRefresh = async () => {
    if (timelineFilter === "nearby") {
      setPanelStates((current) => ({
        ...current,
        nearby: {
          ...current.nearby,
          status: "ready",
          note: homeNearbyPanel.note,
          errorMessage: undefined,
          locationContext: homeNearbyPanel.locationContext
        }
      }));
    }

    refreshFeeds();
    setPanelStates((current) => ({
      ...current,
      [timelineFilter]: {
        ...current[timelineFilter],
        visibleCountByTab: {
          ...current[timelineFilter].visibleCountByTab,
          posts: 10
        }
      }
    }));
    await new Promise((resolve) => window.setTimeout(resolve, 280));
  };

  const retryNearbyFeed = () => {
    setPanelStates((current) => ({
      ...current,
      nearby: {
        ...current.nearby,
        status: "ready",
        note: homeNearbyPanel.note,
        errorMessage: undefined,
        locationContext: homeNearbyPanel.locationContext
      }
    }));
  };

  const handleTimelineFilterChange = (nextFilter: SocialTimelineFilterTab) => {
    setTimelineFilter(nextFilter);
  };

  const emptyStateCopy = getEmptyStateCopy(timelineFilter, "posts", currentPanel);
  const isTimelineLoading = timelineFilter === "nearby" && (currentPanel.status === "idle" || currentPanel.status === "loading");
  const hasTimelineError = timelineFilter === "nearby" && currentPanel.status === "error";

  const timelineContent = (
    <>
      {!embedded ? (
        <FloatingHomeHeader
          className="gap-0"
          frameClassName="z-50"
          maxWidth="1600px"
          panelClassName={floatingHeaderGlassPanelClassName}
          spacerGapPx={0}
          stacked
        >
          <div className={cn(floatingHeaderInnerClassName, "sm:px-4 lg:px-5")}>
            <div className="mx-auto w-full max-w-[1480px]">
              <SharedHomeHeader
                avatarAlt={actor?.displayName ?? "我的头像"}
                avatarLevelLabel={getSocialProfileTextField(actor, "memberLevelLabel")}
                avatarMembershipLevel={getSocialProfileTextField(actor, "memberLevel")}
                avatarSrc={actor?.avatar ?? ""}
                avatarTo={portalConfig.myPath}
                locationCaption="当前服务区域"
                locationLabel={selectedHomeLocation?.label ?? "当前服务区域"}
                locationTo={scope === "user" ? "/me/settings/service-range" : portalConfig.settingsPath}
                settingsLabel="系统设置"
                settingsTo={portalConfig.settingsPath}
              />
              <div className="mt-3">
                <SocialTimelineHeaderSearch to={socialPaths.search(scope)} />
              </div>
            </div>
          </div>
        </FloatingHomeHeader>
      ) : null}

      <div className="space-y-0">
        <div className="py-1 sm:py-1.5">
          <FeatureCarousel cardHeightClassName="h-[204px]" slides={timelineCarouselSlides} />
        </div>

        <div className="pb-1">
          <SocialTimelineFilterTabs onChange={handleTimelineFilterChange} value={timelineFilter} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <aside className="hidden xl:block">
          {actor ? (
            <div className="sticky top-[104px] space-y-4">
              <SocialProfileSummaryCard actorKey={actorKey} profile={actor} scope={scope} />
              <SocialSidebarSection title="快速入口">
                <div className="grid gap-2">
                  <SecondaryLink label="发表动态" to={socialPaths.compose(scope)} />
                  <SecondaryLink label="搜索用户 / 标签" to={socialPaths.search(scope)} />
                </div>
              </SocialSidebarSection>
            </div>
          ) : null}
        </aside>

        <section className="min-w-0">
          <div
            className="relative"
            onTouchEnd={async () => {
              const shouldRefresh = pullDistance > 78;
              touchStartRef.current = null;
              setPullDistance(0);

              if (shouldRefresh) {
                await handleRefresh();
              }
            }}
            onTouchMove={(event) => {
              if (touchStartRef.current === null || window.scrollY > 8) {
                return;
              }

              const nextDistance = Math.max(0, Math.min(108, event.changedTouches[0].clientY - touchStartRef.current));
              setPullDistance(nextDistance);
            }}
            onTouchStart={(event) => {
              if (window.scrollY <= 8) {
                touchStartRef.current = event.changedTouches[0].clientY;
              }
            }}
          >
            <div className="overflow-hidden transition-[height] duration-200" style={{ height: pullDistance }}>
              <div className="flex h-full items-center justify-center text-sm font-semibold text-[color:var(--client-muted)]">
                {pullDistance > 78 ? "松开刷新时间线" : "下拉刷新"}
              </div>
            </div>

            <section className="overflow-hidden border-b border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_12%,transparent)]">
              {pinnedPost ? (
                <div className="border-b border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]">
                  <div className="px-4 py-3 text-xs font-semibold text-[color:var(--client-muted)] sm:px-5">置顶动态</div>
                  <SocialPostItem actorKey={actorKey} post={pinnedPost} scope={scope} />
                </div>
              ) : null}

              {isTimelineLoading ? (
                <div className="p-4">
                  <SocialEmptyState
                    description="正在获取当前位置并刷新附近动态，请稍等一下。"
                    title="正在加载附近动态"
                  />
                </div>
              ) : hasTimelineError ? (
                <div className="p-4">
                  <SocialEmptyState
                    action={<PrimaryButton onClick={() => void retryNearbyFeed()}>重新获取</PrimaryButton>}
                    description={currentPanel.errorMessage ?? "请开启定位后再试一次。"}
                    title="附近动态暂时不可用"
                  />
                </div>
              ) : visiblePosts.length > 0 ? (
                visiblePosts.map((post) => <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />)
              ) : (
                <div className="p-4">
                  <SocialEmptyState
                    action={<PrimaryButton to={socialPaths.compose(scope)}>发表动态</PrimaryButton>}
                    description={emptyStateCopy.description}
                    title={emptyStateCopy.title}
                  />
                </div>
              )}

              {renderedPosts.length > 0 && !isTimelineLoading && !hasTimelineError ? (
                <div className="px-4 py-5 text-center text-sm font-semibold text-[color:var(--client-muted)]" ref={loadMoreRef}>
                  {visibleCount >= renderedPosts.length ? "已经到底了" : "正在加载更多动态..."}
                </div>
              ) : null}
            </section>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="sticky top-[104px] space-y-4">
            <SocialSidebarSection
              action={
                <Link className="text-sm font-semibold text-[color:var(--client-primary)]" to={socialPaths.search(scope)}>
                  全部搜索
                </Link>
              }
              title="正在发生"
            >
              <div className="grid gap-3">
                {trendingTags.map((tag) => (
                  <Link
                    className="flex items-center justify-between rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-4 py-3 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)]"
                    key={tag.tag}
                    to={socialPaths.hashtag(scope, tag.tag)}
                  >
                    <div>
                      <p className="text-sm font-black text-[color:var(--client-text)]">#{tag.tag}</p>
                      <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{tag.count} 条相关动态</p>
                    </div>
                    <span className="text-[color:var(--client-primary)]">›</span>
                  </Link>
                ))}
              </div>
            </SocialSidebarSection>

            <SocialSidebarSection
              action={
                <Link className="text-sm font-semibold text-[color:var(--client-primary)]" to={socialPaths.notifications(scope)}>
                  全部通知
                </Link>
              }
              title="动态通知"
            >
              <div className="grid gap-3">
                {notifications.length > 0 ? (
                  notifications.map((item) => (
                    <NotificationRow
                      actor={profiles[item.actorKey]}
                      at={item.createdAt}
                      avatarTo={socialPaths.profile(scope, item.actorKey)}
                      content={item.content}
                      key={item.id}
                      to={item.postId ? socialPaths.post(scope, item.postId) : socialPaths.profile(scope, item.actorKey)}
                      unread={!item.read}
                    />
                  ))
                ) : (
                  <p className="text-sm leading-6 text-[color:var(--client-muted)]">有人回复、引用、点赞或关注你时，会在这里串起来。</p>
                )}
              </div>
            </SocialSidebarSection>

            {suggestionProfiles.length > 0 ? (
              <SocialSidebarSection title="推荐关注">
                <div className="grid gap-3">
                  {suggestionProfiles.map((profile) => (
                    <div
                      className="flex items-center gap-3 rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)] px-3 py-3"
                      key={profileKey(profile)}
                    >
                      <Link className="shrink-0" to={socialPaths.profile(scope, profile)}>
                        <AvatarImage alt={profile.displayName} className="h-12 w-12" src={profile.avatar} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link className="truncate text-sm font-black text-[color:var(--client-text)]" to={socialPaths.profile(scope, profile)}>
                          {profile.displayName}
                        </Link>
                      </div>
                      <SocialFollowButton actorKey={actorKey} compact scope={scope} targetKey={profileKey(profile)} />
                    </div>
                  ))}
                </div>
              </SocialSidebarSection>
            ) : null}
          </div>
        </aside>
      </div>

      <SocialComposeFab scope={scope} />
    </>
  );

  if (embedded) {
    return <div className="space-y-0 pb-6">{timelineContent}</div>;
  }

  return (
    <PageScaffold contentClassName="space-y-0 pb-32 pt-0" navItems={navItemsForSocialScope(scope)} showTopEdgeMask={false}>
      {timelineContent}
    </PageScaffold>
  );
}

function SecondaryLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      className="inline-flex h-12 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_76%,transparent)] px-5 text-sm font-black text-[color:var(--client-text)] transition hover:-translate-y-0.5"
      to={to}
    >
      {label}
    </Link>
  );
}
