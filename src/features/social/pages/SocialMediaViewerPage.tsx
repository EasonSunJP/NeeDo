import { useMemo } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { shareContent } from "../../../lib/share";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { MediaViewerControls, navItemsForSocialScope, SocialEmptyState, SocialTopActions, UnifiedPostText } from "../components/SocialUi";
import { buildAbsoluteUrl, formatCount } from "../utils";

export function SocialMediaViewerPage() {
  const { postId, mediaId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { getActorForScope, getPostById, getUnreadNotificationCount, profiles } = useSocial();
  const actorKey = getActorForScope(scope);
  const post = postId ? getPostById(postId) : undefined;
  const currentIndex = Number(searchParams.get("index") ?? 0);
  const media = useMemo(
    () => (post ? post.media.find((item) => item.id === mediaId) ?? post.media[currentIndex] : undefined),
    [currentIndex, mediaId, post]
  );
  const mediaIndex = post?.media.findIndex((item) => item.id === media?.id) ?? -1;

  if (!post || !media) {
    return (
      <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
        <AppTopBar actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />} subtitle="媒体不可用" title="媒体查看" />
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>回到动态首页</PrimaryButton>}
          description="当前媒体链接已失效，或者原动态不再可用。"
          title="找不到媒体内容"
        />
      </PageScaffold>
    );
  }

  const goToIndex = (nextIndex: number) => {
    const length = post.media.length;
    const normalized = (nextIndex + length) % length;
    const nextMedia = post.media[normalized];
    navigate(socialPaths.media(scope, post.id, nextMedia.id, normalized), { replace: true });
  };

  return (
    <PageScaffold className="bg-[#050505]" contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        subtitle={`${mediaIndex + 1} / ${post.media.length}`}
        title="媒体查看"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SurfacePanel className="space-y-4 rounded-[30px] border border-white/10 bg-[color:rgba(255,255,255,0.04)]">
            <div className="overflow-hidden rounded-[28px] bg-black">
              {media.type === "video" ? (
                <video className="max-h-[72vh] w-full object-contain" controls poster={media.thumbnailUrl} src={media.url} />
              ) : (
                <img alt={media.alt ?? ""} className="max-h-[72vh] w-full object-contain" src={media.url} />
              )}
            </div>

            <MediaViewerControls
              onNext={() => goToIndex(mediaIndex + 1)}
              onPrevious={() => goToIndex(mediaIndex - 1)}
              onShare={async () => {
                await shareContent({
                  title: `${post.text ? `${post.text.slice(0, 28)}${post.text.length > 28 ? "..." : ""}` : "NeeDo 动态媒体"} | NeeDo`,
                  text: "在 NeeDo 查看这条媒体内容",
                  url: buildAbsoluteUrl(socialPaths.media(scope, post.id, media.id, mediaIndex))
                });
              }}
            />

            <div className="grid gap-2 sm:grid-cols-4">
              {post.media.map((item, index) => (
                <button
                  className={
                    item.id === media.id
                      ? "overflow-hidden rounded-[18px] ring-2 ring-[color:var(--client-primary)]"
                      : "overflow-hidden rounded-[18px] opacity-80 transition hover:opacity-100"
                  }
                  key={item.id}
                  onClick={() => goToIndex(index)}
                  type="button"
                >
                  {item.type === "video" ? (
                    <video className="h-24 w-full object-cover" muted poster={item.thumbnailUrl} src={item.url} />
                  ) : (
                    <img alt={item.alt ?? ""} className="h-24 w-full object-cover" src={item.url} />
                  )}
                </button>
              ))}
            </div>
          </SurfacePanel>
        </section>

        <aside className="space-y-4">
          <SurfacePanel className="space-y-4 border border-white/10 bg-[color:rgba(255,255,255,0.04)]">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">原动态概览</h2>
            {post.text ? (
              <UnifiedPostText allowExpand={false} className="text-sm leading-7 text-[color:var(--client-muted)]" profiles={profiles} scope={scope} text={post.text} />
            ) : (
              <p className="text-sm leading-7 text-[color:var(--client-muted)]">这条动态主要以媒体内容为主。</p>
            )}
            <div className="flex flex-wrap gap-2 text-sm font-semibold text-[color:var(--client-muted)]">
              <span>{formatCount(post.replyCount)} 回复</span>
              <span>{formatCount(post.repostCount)} 转发</span>
              <span>{formatCount(post.likeCount)} 喜欢</span>
            </div>
            <PrimaryButton to={socialPaths.post(scope, post.id)}>回到帖子详情</PrimaryButton>
          </SurfacePanel>
        </aside>
      </div>
    </PageScaffold>
  );
}
