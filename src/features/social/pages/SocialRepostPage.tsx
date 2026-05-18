import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SecondaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { navItemsForSocialScope, SocialEmptyState, SocialPostItem, SocialTopActions } from "../components/SocialUi";

export function SocialRepostPage() {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { getActorForScope, getPostById, getInteractionState, toggleRepost, getUnreadNotificationCount } = useSocial();
  const actorKey = getActorForScope(scope);
  const post = postId ? getPostById(postId, actorKey) : undefined;
  const interaction = post ? getInteractionState(post.id, actorKey) : undefined;
  const [status, setStatus] = useState("");

  if (!post) {
    return (
      <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
        <AppTopBar actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />} subtitle="动态不存在" title="转发动态" />
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态首页</PrimaryButton>}
          description="原动态可能已删除，无法继续转发或引用。"
          title="找不到原动态"
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info="快速转发或带观点引用"
        title="转发 / 引用"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SurfacePanel className="space-y-4 rounded-[30px]">
            <div className="flex flex-wrap gap-3">
              <PrimaryButton
                onClick={() => {
                  toggleRepost(post.id, actorKey);
                  setStatus(interaction?.reposted ? "已取消转发" : "已转发到你的时间线");
                }}
              >
                {interaction?.reposted ? "取消转发" : "立即转发"}
              </PrimaryButton>
              <SecondaryButton to={socialPaths.compose(scope, { quotePostId: post.id })}>引用转发</SecondaryButton>
            </div>
            <p className="text-sm leading-7 text-[color:var(--client-muted)]">
              快速转发会生成一条新的 repost item；引用转发会带着原帖卡片进入完整发文页。
            </p>
            {status ? <p className="text-sm font-semibold text-[color:var(--client-primary)]">{status}</p> : null}
          </SurfacePanel>

          <SurfacePanel className="space-y-3 rounded-[30px] p-0">
            <div className="px-5 pt-5">
              <h2 className="text-lg font-black text-[color:var(--client-text)]">原动态</h2>
            </div>
            <SocialPostItem actorKey={actorKey} post={post} scope={scope} />
          </SurfacePanel>
        </section>

        <aside className="space-y-4">
          <SurfacePanel className="space-y-4">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">流程说明</h2>
            <ul className="space-y-2 text-sm leading-7 text-[color:var(--client-muted)]">
              <li>快速转发：直接把原帖转进你的公开时间线。</li>
              <li>引用转发：带着原帖卡片进入发帖页，补充你的观点。</li>
              <li>转发状态和计数会回写到首页、详情页和资料页。</li>
            </ul>
          </SurfacePanel>

          <SecondaryButton className="justify-center" onClick={() => navigate(socialPaths.post(scope, post.id))}>
            回到帖子详情
          </SecondaryButton>
        </aside>
      </div>
    </PageScaffold>
  );
}
