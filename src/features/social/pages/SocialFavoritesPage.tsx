import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { useSocial } from "../context";
import { socialPaths } from "../paths";
import { navItemsForSocialScope, SocialEmptyState, SocialPostItem, SocialTopActions } from "../components/SocialUi";

export function SocialFavoritesPage() {
  const scope = "user" as const;
  const { getActorForScope, getUnreadNotificationCount, state } = useSocial();
  const actorKey = getActorForScope(scope);
  const interactions = state.interactions[actorKey] ?? {};
  const bookmarkedPosts = state.posts.filter((post) => interactions[post.id]?.bookmarked);

  return (
    <PageScaffold contentClassName="space-y-5 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info={`${bookmarkedPosts.length} 条已收藏动态`}
        title="我的收藏"
      />
      {bookmarkedPosts.length === 0 ? (
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>去看动态</PrimaryButton>}
          description="在动态中点击书签后，会保存到这里；取消收藏会同步移除。"
          title="还没有收藏动态"
        />
      ) : (
        <div className="space-y-4">
          {bookmarkedPosts.map((post) => (
            <SocialPostItem actorKey={actorKey} key={post.id} post={post} scope={scope} />
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
