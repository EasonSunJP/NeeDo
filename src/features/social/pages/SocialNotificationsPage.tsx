import { useEffect } from "react";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { useLocation } from "react-router-dom";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { navItemsForSocialScope, NotificationRow, SocialEmptyState, SocialTopActions } from "../components/SocialUi";

export function SocialNotificationsPage() {
  const location = useLocation();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { profiles, getActorForScope, getNotifications, getUnreadNotificationCount, markNotificationsRead } = useSocial();
  const actorKey = getActorForScope(scope);
  const notifications = getNotifications(actorKey);
  const unreadCount = getUnreadNotificationCount(actorKey);

  useEffect(() => {
    markNotificationsRead(actorKey);
  }, [actorKey]);

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={unreadCount} />}
        subtitle={unreadCount > 0 ? `${unreadCount} 条未读动态通知` : "已全部读完"}
        title="动态通知"
      />

      <div className="grid gap-4">
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
          <SocialEmptyState
            action={<PrimaryButton to={socialPaths.timeline(scope)}>去逛动态首页</PrimaryButton>}
            description="当有人回复、点赞、引用、转发、关注或提到你时，会从这里统一进入。"
            title="通知中心暂时为空"
          />
        )}
      </div>
    </PageScaffold>
  );
}
