import { useMemo } from "react";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { useLocation } from "react-router-dom";
import { getLocationAreaHints } from "../../../lib/location";
import { useHomeLayoutStore } from "../../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../../state/homeLocationStore";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { buildTimelineUpdateNotifications } from "../timeline-notifications";
import { navItemsForSocialScope, NotificationRow, SocialEmptyState } from "../components/SocialUi";

export function SocialNotificationsPage() {
  const location = useLocation();
  const scope = getSocialScopeFromPathname(location.pathname);
  const { profiles, getActorForScope, getTimelineFeed } = useSocial();
  const actorKey = getActorForScope(scope);
  const { config: homeLocationConfig } = useHomeLayoutStore();
  const { state: homeLocationPreference } = useHomeLocationPreference();
  const selectedHomeLocation =
    homeLocationConfig.locations.find((item) => item.id === homeLocationConfig.selectedLocationId) ?? homeLocationConfig.locations[0];
  const nearbyLocationContext = useMemo(
    () => ({
      ...(homeLocationPreference.source === "device" && homeLocationPreference.coordinates
        ? { coords: homeLocationPreference.coordinates }
        : {}),
      areaHints: getLocationAreaHints(selectedHomeLocation)
    }),
    [homeLocationPreference.coordinates, homeLocationPreference.source, selectedHomeLocation]
  );
  const friendPosts = useMemo(() => getTimelineFeed("friends", actorKey), [actorKey, getTimelineFeed]);
  const nearbyPosts = useMemo(
    () => getTimelineFeed("nearby", actorKey, nearbyLocationContext),
    [actorKey, getTimelineFeed, nearbyLocationContext]
  );
  const notifications = useMemo(
    () => buildTimelineUpdateNotifications({ actorKey, friendPosts, nearbyPosts, profiles }),
    [actorKey, friendPosts, nearbyPosts, profiles]
  );


  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        closeTo={socialPaths.timeline(scope)}
        info="附近与好友新动态"
        title="动态通知"
      />

      <div className="grid gap-4">
        {notifications.length > 0 ? (
          notifications.map((item) => (
            <NotificationRow
              actor={profiles[item.actorKey]}
              at={item.createdAt}
              avatarTo={socialPaths.profile(scope, profiles[item.actorKey])}
              content={item.content}
              key={item.id}
              to={socialPaths.post(scope, item.postId)}
              unread={item.unread}
            />
          ))
        ) : (
          <SocialEmptyState
            action={<PrimaryButton to={socialPaths.timeline(scope)}>去逛动态首页</PrimaryButton>}
            description="附近或好友发布新动态后，会在这里提示。"
            title="通知中心暂时为空"
          />
        )}
      </div>
    </PageScaffold>
  );
}
