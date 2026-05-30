import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { FloatingHeaderSearchBar } from "../../../components/mobile/FloatingHeaderSearchBar";
import { FloatingHomeHeader, floatingHeaderGlassPanelClassName, floatingHeaderInnerClassName } from "../../../components/mobile/FloatingHomeHeader";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { getLocationAreaHints } from "../../../lib/location";
import { cn } from "../../../lib/utils";
import { useHomeLayoutStore } from "../../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../../state/homeLocationStore";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { type SocialTimelineLocationContext } from "../timeline";
import {
  navItemsForSocialScope,
  SearchTabs,
  SocialEmptyState,
  SocialPostItem
} from "../components/SocialUi";
import { profileKey, sortPostsByNewest } from "../utils";
import type { SocialPost, SocialSearchTab } from "../types";

export function SocialSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tag: routeTag } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  const {
    getActorForScope,
    search,
    getTagFeed,
    getTimeline,
    getTimelineFeed,
    getProfilePosts
  } = useSocial();
  const actorKey = getActorForScope(scope);
  const { config: homeLocationConfig } = useHomeLayoutStore();
  const { state: homeLocationPreference } = useHomeLocationPreference();
  const selectedHomeLocation =
    homeLocationConfig.locations.find((item) => item.id === homeLocationConfig.selectedLocationId) ?? homeLocationConfig.locations[0];
  const tag = routeTag ?? searchParams.get("tag") ?? "";
  const q = searchParams.get("q") ?? "";
  const [input, setInput] = useState(routeTag ? `#${routeTag}` : tag || q);
  const [tab, setTab] = useState<SocialSearchTab>(tag ? "latest" : "nearby");
  const queryResult = useMemo(() => search(q), [q, search]);
  const tagFeed = useMemo(() => (tag ? getTagFeed(tag) : []), [getTagFeed, tag]);
  const isTagPage = Boolean(tag);
  const profileResults = q ? queryResult.profiles : [];
  const nearbyLocationContext = useMemo<SocialTimelineLocationContext>(() => {
    const areaHints = getLocationAreaHints(selectedHomeLocation);

    return {
      ...(homeLocationPreference.source === "device" && homeLocationPreference.coordinates ? { coords: homeLocationPreference.coordinates } : {}),
      ...(areaHints.length > 0 ? { areaHints } : {})
    };
  }, [
    homeLocationPreference.coordinates?.lat,
    homeLocationPreference.coordinates?.lng,
    homeLocationPreference.source,
    selectedHomeLocation
  ]);
  const nearbyFeed = useMemo(
    () => getTimelineFeed("nearby", actorKey, nearbyLocationContext).slice(0, 12),
    [actorKey, getTimelineFeed, nearbyLocationContext]
  );
  const latestFeed = useMemo(() => getTimeline("for-you", actorKey).slice(0, 12), [actorKey, getTimeline]);
  const followingFeed = useMemo(() => getTimeline("following", actorKey).slice(0, 12), [actorKey, getTimeline]);
  const friendsFeed = useMemo(() => getTimelineFeed("friends", actorKey).slice(0, 12), [actorKey, getTimelineFeed]);
  const profileMatchedPosts = useMemo(
    () => sortPostsByNewest(profileResults.flatMap((profile) => getProfilePosts(profileKey(profile), "posts", actorKey))),
    [actorKey, getProfilePosts, profileResults]
  );
  const mergedSearchPosts = useMemo(
    () => mergeSocialSearchPosts(q ? [...queryResult.posts, ...profileMatchedPosts] : latestFeed),
    [latestFeed, profileMatchedPosts, q, queryResult.posts]
  );

  useEffect(() => {
    setInput(routeTag ? `#${routeTag}` : tag || q);

    if (tag) {
      setTab("latest");
    }
  }, [q, routeTag, tag]);

  const postResults = useMemo(() => {
    const scopedSearchPosts = isTagPage ? sortPostsByNewest(tagFeed) : mergedSearchPosts;

    if (tab === "latest") {
      return scopedSearchPosts;
    }

    const feed = tab === "nearby" ? nearbyFeed : tab === "following" ? followingFeed : friendsFeed;

    if (q || isTagPage) {
      return filterSearchPostsByFeed(scopedSearchPosts, feed);
    }

    return feed;
  }, [friendsFeed, followingFeed, isTagPage, mergedSearchPosts, nearbyFeed, q, tab, tagFeed]);

  const handleSearchSubmit = () => {
    const next = input.trim();

    if (!next) {
      setSearchParams({});
      navigate(socialPaths.search(scope));
      setTab("nearby");
      return;
    }

    if (next.startsWith("#")) {
      navigate(socialPaths.hashtag(scope, next.slice(1)));
      setTab("latest");
      return;
    }

    navigate(socialPaths.search(scope, next));
    setTab("nearby");
  };

  return (
    <PageScaffold contentClassName="pb-28 pt-0" navItems={navItemsForSocialScope(scope)} showTopEdgeMask={false}>
      <FloatingHomeHeader
        className="gap-0"
        frameClassName="z-40"
        maxWidth="1600px"
        panelClassName={cn(floatingHeaderGlassPanelClassName, "text-[color:var(--client-text)]")}
        spacerGapPx={0}
        stacked
      >
        <div className={cn(floatingHeaderInnerClassName, "sm:px-4 lg:px-5")}>
          <div className="mx-auto w-full max-w-[1480px] space-y-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                aria-label="返回"
                className={cn(floatingHeaderControlButtonClassName, "h-10 w-10 shrink-0")}
                onClick={() => navigate(-1)}
                type="button"
              >
                <AppIcon className="h-5 w-5" name="back" />
              </button>
              <div className="min-w-0 flex-1">
                <FloatingHeaderSearchBar
                  actionAriaLabel="开始搜索动态"
                  fieldAriaLabel="搜索动态内容"
                  onChange={setInput}
                  onSubmit={handleSearchSubmit}
                  placeholder="搜索 @用户、#话题、动态内容"
                  value={input}
                />
              </div>
            </div>
            <SearchTabs onChange={setTab} value={tab} />
          </div>
        </div>
      </FloatingHomeHeader>

      {isTagPage ? (
        <SurfacePanel className="mt-4 space-y-3 rounded-[28px] p-4">
          <p className="text-[11px] font-black tracking-[0.18em] text-[color:var(--client-primary)]">话题页</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <TitleWithInfo
              as="h2"
              info="话题页会按当前搜索范围过滤动态：附近、最新、关注和好友。"
              infoClassName="h-5 w-5 text-[11px]"
              label={`#${tag} 说明`}
              title={`#${tag}`}
              titleClassName="text-[26px] font-black text-[color:var(--client-text)]"
            />
            <p className="text-sm font-semibold text-[color:var(--client-muted)]">{postResults.length} 条动态</p>
          </div>
        </SurfacePanel>
      ) : null}

      <SearchSection
        emptyAction={<PrimaryButton to={socialPaths.timeline(scope)}>回到动态首页</PrimaryButton>}
        emptyDescription={q || isTagPage ? "当前范围内还没有命中动态。可以换更短的关键词，或切到最新、关注、好友范围再试。" : "当前范围暂时没有动态。可以切换到最新、关注或好友。"}
        items={postResults.length}
        title="搜索结果"
      >
        <div className="-mx-4 border-t border-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)] sm:-mx-6">
          {postResults.map((post) => (
            <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />
          ))}
        </div>
      </SearchSection>
    </PageScaffold>
  );
}

function mergeSocialSearchPosts(posts: SocialPost[]) {
  const postMap = new Map<string, SocialPost>();

  posts.forEach((post) => {
    postMap.set(post.id, post);
  });

  return sortPostsByNewest([...postMap.values()]);
}

function filterSearchPostsByFeed(posts: SocialPost[], feed: SocialPost[]) {
  const feedIds = new Set(feed.map((post) => post.id));

  return posts.filter((post) => feedIds.has(post.id));
}

function SearchSection({
  title,
  items,
  emptyDescription,
  emptyAction,
  children
}: {
  title: string;
  items: number;
  emptyDescription: string;
  emptyAction: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[color:var(--client-text)]">{title}</h2>
        <p className="text-sm font-semibold text-[color:var(--client-muted)]">{items} 条</p>
      </div>
      {items > 0 ? children : <SocialEmptyState action={emptyAction} description={emptyDescription} title="暂无搜索结果" />}
    </section>
  );
}
