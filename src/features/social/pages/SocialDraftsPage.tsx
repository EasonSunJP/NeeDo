import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { Button } from "../../../components/ui/Button";
import { InteractiveAvatar } from "../../../components/ui/InteractiveAvatar";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { navItemsForSocialScope, SocialEmptyState, SocialTopActions } from "../components/SocialUi";
import { formatRelativeTime, formatSocialVisibilityLabel } from "../utils";

export function SocialDraftsPage() {
  const location = useLocation();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { state, profiles, getActorForScope, getUnreadNotificationCount, clearDraft } = useSocial();
  const actorKey = getActorForScope(scope);
  const drafts = useMemo(
    () =>
      Object.entries(state.drafts)
        .filter(([key]) => key.startsWith(`composer:${scope}:`))
        .sort((left, right) => new Date(right[1].updatedAt).getTime() - new Date(left[1].updatedAt).getTime()),
    [scope, state.drafts]
  );

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info="退出发帖页后自动保存到本地"
        title="草稿列表"
      />

      {drafts.length === 0 ? (
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.compose(scope)}>去写一条动态</PrimaryButton>}
          description="当前身份下还没有未发送的草稿。新的公开动态、回复和引用都会自动进入这里。"
          title="还没有草稿"
        />
      ) : (
        <div className="grid gap-4">
          {drafts.map(([draftKey, draft]) => {
            const author = profiles[draft.authorKey];
            const resumePath = socialPaths.compose(scope, {
              author: draft.authorKey,
              editPostId: draft.editPostId,
              quotePostId: draft.quotePostId,
              replyToPostId: draft.replyToPostId
            });

            return (
              <SurfacePanel className="space-y-4 rounded-[28px]" key={draftKey}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    {author ? <InteractiveAvatar alt={author.displayName} className="h-11 w-11" src={author.avatar} to={socialPaths.profile(scope, author)} /> : null}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-black text-[color:var(--client-text)]">{author?.displayName ?? "草稿作者"}</p>
                      </div>
                      <p className="mt-1 text-sm text-[color:var(--client-muted)]">
                        {draft.replyToPostId ? "回复草稿" : draft.quotePostId ? "引用转发草稿" : draft.editPostId ? "编辑草稿" : "公开动态草稿"} ·
                        {" "}
                        {formatRelativeTime(draft.updatedAt)}
                      </p>
                    </div>
                  </div>

                  <Button className="shrink-0" onClick={() => clearDraft(draftKey)} size="sm" variant="secondary">
                    删除
                  </Button>
                </div>

                <Link
                  className="block rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_74%,transparent)] px-4 py-4 transition hover:bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)]"
                  to={resumePath}
                >
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[color:var(--client-text)]">
                    {draft.text.trim() || "这条草稿目前只有媒体，还没有正文。"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-[color:var(--client-muted)]">
                    <span>{draft.media.length} 个媒体</span>
                    <span>{formatSocialVisibilityLabel(draft.visibility ?? "public")}</span>
                    {draft.locationLabel ? <span>{draft.locationLabel}</span> : null}
                  </div>
                </Link>
              </SurfacePanel>
            );
          })}
        </div>
      )}
    </PageScaffold>
  );
}
