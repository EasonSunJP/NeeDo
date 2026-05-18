import { useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { navItemsForSocialScope, RelationshipTabs, SocialEmptyState, SocialProfileRow, SocialTopActions } from "../components/SocialUi";
import { profileKey } from "../utils";

export function SocialRelationshipsPage() {
  const { entityType, id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { profiles, getActorForScope, getFollowers, getFollowing, getUnreadNotificationCount } = useSocial();
  const actorKey = getActorForScope(scope);
  const profile = entityType && id ? profiles[`${entityType}:${id}`] : undefined;
  const routeMode = location.pathname.endsWith("/following") ? "following" : "followers";
  const list = useMemo(() => {
    if (!profile) {
      return [];
    }

    return routeMode === "followers" ? getFollowers(profileKey(profile)) : getFollowing(profileKey(profile));
  }, [getFollowers, getFollowing, profile, routeMode]);

  if (!profile) {
    return (
      <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
        <AppTopBar actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />} subtitle="资料不可用" title="关注关系" />
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态首页</PrimaryButton>}
          description="当前资料不存在，无法查看关注关系。"
          title="找不到资料页"
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        subtitle={profile.displayName}
        title="关注关系"
      />

      <div className="flex items-center justify-between gap-3">
        <RelationshipTabs
          onChange={(value) => navigate(value === "followers" ? socialPaths.followers(scope, profile) : socialPaths.following(scope, profile))}
          value={routeMode}
        />
        <p className="text-sm font-semibold text-[color:var(--client-muted)]">
          {routeMode === "followers" ? `${profile.displayName} 的粉丝` : `${profile.displayName} 正在关注`}
        </p>
      </div>

      <div className="grid gap-4">
        {list.length > 0 ? (
          list.map((item) => <SocialProfileRow actorKey={actorKey} key={profileKey(item)} profile={item} scope={scope} />)
        ) : (
          <SocialEmptyState
            action={<PrimaryButton to={socialPaths.profile(scope, profile)}>回到资料页</PrimaryButton>}
            description="当前列表还没有可展示的关系。后续关注和取消关注都会同步回这里。"
            title={routeMode === "followers" ? "还没有粉丝" : "还没有关注任何人"}
          />
        )}
      </div>
    </PageScaffold>
  );
}
