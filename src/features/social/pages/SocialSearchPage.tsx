import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { Button } from "../../../components/ui/Button";
import { TitleWithInfo } from "../../../components/ui/TitleWithInfo";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import {
  MediaLightbox,
  MediaPlayGlyph,
  getSocialMediaPreviewUrl,
  navItemsForSocialScope,
  SearchTabs,
  SocialEmptyState,
  SocialPostItem,
  SocialProfileRow,
  SocialTopActions
} from "../components/SocialUi";
import { profileKey } from "../utils";
import type { SocialMediaItem } from "../types";

export function SocialSearchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tag: routeTag } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { getActorForScope, search, getTagFeed, getTimeline, getTrendingTags, getUnreadNotificationCount } = useSocial();
  const actorKey = getActorForScope(scope);
  const tag = routeTag ?? searchParams.get("tag") ?? "";
  const q = searchParams.get("q") ?? "";
  const [input, setInput] = useState(routeTag ? `#${routeTag}` : tag || q);
  const [tab, setTab] = useState<"all" | "profiles" | "posts" | "media" | "tags">(tag ? "posts" : "all");
  const [lightbox, setLightbox] = useState<{ media: SocialMediaItem[]; index: number } | null>(null);
  const discoveryResult = useMemo(() => search(""), [search]);
  const queryResult = useMemo(() => search(q), [q, search]);
  const tagResult = useMemo(() => (tag ? search(tag) : { profiles: [], posts: [], tags: [] }), [search, tag]);
  const tagFeed = useMemo(() => (tag ? getTagFeed(tag) : []), [getTagFeed, tag]);
  const trendingTags = getTrendingTags().slice(0, 8);

  useEffect(() => {
    setInput(routeTag ? `#${routeTag}` : tag || q);
    if (tag) {
      setTab("posts");
    }
  }, [q, routeTag, tag]);

  const isTagPage = Boolean(tag);
  const profileResults = isTagPage ? tagResult.profiles : q ? queryResult.profiles : discoveryResult.profiles;
  const postResults = isTagPage ? tagFeed : q ? queryResult.posts : getTimeline("for-you", actorKey).slice(0, 8);
  const mediaResults = postResults.flatMap((post) =>
    post.media.map((media, index) => ({
      post,
      media,
      index
    }))
  );
  const relatedTags = isTagPage ? trendingTags.filter((item) => item.tag !== tag).slice(0, 6) : q ? queryResult.tags : trendingTags;
  const showProfiles = tab === "all" || tab === "profiles";
  const showPosts = tab === "all" || tab === "posts";
  const showMedia = tab === "all" || tab === "media";
  const showTags = tab === "all" || tab === "tags";

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info="搜索用户、店铺、技师、动态和 hashtag"
        title="动态搜索"
      />

      <SurfacePanel className="space-y-4 rounded-[30px] p-5">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const next = input.trim();

            if (!next) {
              setSearchParams({});
              navigate(socialPaths.search(scope));
              setTab("all");
              return;
            }

            if (next.startsWith("#")) {
              navigate(socialPaths.hashtag(scope, next.slice(1)));
              setTab("posts");
              return;
            }

            navigate(socialPaths.search(scope, next));
          }}
        >
          <input
            className="h-12 flex-1 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] px-5 outline-none"
            onChange={(event) => setInput(event.target.value)}
            placeholder="搜索 @用户、#话题、动态内容"
            value={input}
          />
          <Button className="h-12 px-6" type="submit">
            搜索
          </Button>
        </form>
        <SearchTabs onChange={setTab} value={tab} />
      </SurfacePanel>

      {isTagPage ? (
        <SurfacePanel className="space-y-3 rounded-[30px] p-5">
          <p className="text-[11px] font-black tracking-[0.18em] text-[color:var(--client-primary)]">话题页</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <TitleWithInfo
                as="h2"
                info="这是统一 social 搜索页里的 hashtag 时间线入口，不再只是标签列表。"
                infoClassName="h-5 w-5 text-[11px]"
                label={`#${tag} 说明`}
                title={`#${tag}`}
                titleClassName="text-[28px] font-black tracking-[-0.03em] text-[color:var(--client-text)]"
              />
            </div>
            <p className="text-sm font-semibold text-[color:var(--client-muted)]">{postResults.length} 条公开动态</p>
          </div>
        </SurfacePanel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-6">
          {showProfiles ? (
            <SearchSection
              emptyAction={<PrimaryButton to={socialPaths.timeline(scope)}>回到时间线</PrimaryButton>}
              emptyDescription="还没有匹配到相关资料。可以换关键词，或者直接浏览推荐流里的资料跳转。"
              items={profileResults.length}
              title="用户 / 店铺 / 技师"
            >
              <div className="grid gap-4">
                {profileResults.slice(0, tab === "all" ? 4 : profileResults.length).map((profile) => (
                  <SocialProfileRow actorKey={actorKey} key={profileKey(profile)} profile={profile} scope={scope} />
                ))}
              </div>
            </SearchSection>
          ) : null}

          {showPosts ? (
            <SearchSection
              emptyAction={<PrimaryButton to={socialPaths.timeline(scope)}>去看推荐动态</PrimaryButton>}
              emptyDescription={isTagPage ? "这个 hashtag 还没有内容。你可以先发一条带标签的动态。" : "暂时没有命中动态内容。可以切换到标签搜索，或者换更宽泛的关键词。"}
              items={postResults.length}
              title={isTagPage ? `#${tag} 时间线` : "动态结果"}
            >
              <div className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,transparent)]">
                {postResults.slice(0, tab === "all" && !isTagPage ? 4 : postResults.length).map((post) => (
                  <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />
                ))}
              </div>
            </SearchSection>
          ) : null}

          {showMedia ? (
            <SearchSection
              emptyAction={<PrimaryButton to={socialPaths.timeline(scope)}>回到时间线</PrimaryButton>}
              emptyDescription={isTagPage ? "这个 hashtag 还没有媒体内容。" : "当前没有命中图片或视频内容。"}
              items={mediaResults.length}
              title={isTagPage ? `#${tag} 媒体` : "媒体结果"}
            >
              <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {mediaResults.slice(0, tab === "all" ? 6 : mediaResults.length).map(({ post, media, index }) => (
                  <button
                    className="group relative block overflow-hidden border-0 bg-black p-0 text-left"
                    key={`${post.id}-${media.id}`}
                    onClick={() => setLightbox({ media: post.media, index })}
                    type="button"
                  >
                    {media.type === "video" ? (
                      <>
                        <video className="h-[220px] w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" muted poster={media.thumbnailUrl ? getSocialMediaPreviewUrl({ url: media.thumbnailUrl }) : undefined} src={media.url} />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <span className="grid h-11 w-11 place-items-center rounded-full bg-black/58 text-white">
                            <MediaPlayGlyph className="ml-0.5 h-4 w-4" />
                          </span>
                        </div>
                      </>
                    ) : (
                      <img alt={media.alt ?? ""} className="h-[220px] w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" src={getSocialMediaPreviewUrl(media)} />
                    )}
                  </button>
                ))}
              </div>
            </SearchSection>
          ) : null}

          {lightbox ? (
            <MediaLightbox
              activeIndex={lightbox.index}
              media={lightbox.media}
              onChange={(index) => setLightbox((current) => (current ? { ...current, index } : current))}
              onClose={() => setLightbox(null)}
            />
          ) : null}

          {showTags ? (
            <SearchSection
              emptyAction={<PrimaryButton to={socialPaths.timeline(scope)}>浏览热门话题</PrimaryButton>}
              emptyDescription="当前没有匹配的标签内容。你也可以直接在发帖时创建新的 hashtag。"
              items={relatedTags.length}
              title={isTagPage ? "相关话题" : "Hashtag"}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {relatedTags.map((item) => (
                  <Link
                    className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-4 py-4 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_70%,transparent)]"
                    key={item.tag}
                    to={socialPaths.hashtag(scope, item.tag)}
                  >
                    <p className="text-base font-black text-[color:var(--client-text)]">#{item.tag}</p>
                    <p className="mt-1 text-sm text-[color:var(--client-muted)]">{item.count} 条相关动态</p>
                  </Link>
                ))}
              </div>
            </SearchSection>
          ) : null}

          {profileResults.length === 0 && postResults.length === 0 && mediaResults.length === 0 && relatedTags.length === 0 ? (
            <SocialEmptyState
              action={<PrimaryButton to={socialPaths.timeline(scope)}>回到动态首页</PrimaryButton>}
              description="当前关键字还没有搜索结果。你可以换更短的关键词，或者直接从热门话题进入。"
              title="没有匹配结果"
            />
          ) : null}
        </section>

        <aside className="space-y-4">
          <SurfacePanel className="space-y-4">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">热门话题</h2>
            <div className="grid gap-3">
              {trendingTags.map((item) => (
                <Link
                  className="rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-surface)_68%,transparent)] px-4 py-3 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_80%,transparent)]"
                  key={item.tag}
                  to={socialPaths.hashtag(scope, item.tag)}
                >
                  <p className="text-sm font-black text-[color:var(--client-text)]">#{item.tag}</p>
                  <p className="mt-1 text-xs font-semibold text-[color:var(--client-muted)]">{item.count} 条动态</p>
                </Link>
              ))}
            </div>
          </SurfacePanel>

          <SurfacePanel className="space-y-3">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">发现位预留</h2>
            <p className="text-sm leading-7 text-[color:var(--client-muted)]">热门动态、相关账号和 hashtag 时间线都已经归入同一套搜索页，后续可以继续接推荐算法或后端榜单接口。</p>
          </SurfacePanel>
        </aside>
      </div>
    </PageScaffold>
  );
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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-black text-[color:var(--client-text)]">{title}</h2>
        <p className="text-sm font-semibold text-[color:var(--client-muted)]">{items} 项</p>
      </div>
      {items > 0 ? children : <SocialEmptyState action={emptyAction} description={emptyDescription} title={`${title}暂无结果`} />}
    </section>
  );
}
