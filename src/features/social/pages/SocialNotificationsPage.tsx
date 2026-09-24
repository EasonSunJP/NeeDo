import { useMemo } from "react";
import { AppTopBar, PageScaffold, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { ContactEventTimeline, type ContactEventTimelineEntry } from "../../../components/mobile/ContactEventTimeline";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../../i18n/I18nProvider";
import { translateText } from "../../../i18n/translations";
import { getLocationAreaHints } from "../../../lib/location";
import { useHomeLayoutStore } from "../../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../../state/homeLocationStore";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { buildTimelineUpdateNotifications } from "../timeline-notifications";
import { navItemsForSocialScope, SocialEmptyState } from "../components/SocialUi";

export function SocialNotificationsPage() {
  const { language } = useI18n();
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
  const timelineEvents: ContactEventTimelineEntry[] = notifications.map((item) => ({
    id: item.id,
    atLabel: <time dateTime={item.createdAt} data-no-i18n>
      <span className="block">{new Date(item.createdAt).toLocaleDateString(language, { year: "numeric", month: "2-digit", day: "2-digit" })}</span>
      <span className="block">{new Date(item.createdAt).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })}</span>
    </time>,
    preserveAtLabel: true,
    actorName: <span data-no-i18n>{profiles[item.actorKey]?.displayName ?? translateText("用户", language)}</span>,
    actorAvatarSrc: profiles[item.actorKey]?.avatar,
    actorRole: translateText(item.unread ? "未读" : "已读", language),
    title: item.content,
    message: <span data-no-i18n>{translateText(item.content, language)}</span>,
    tone: item.unread ? "green" : "neutral",
    actions: <Link className="focus-ring rounded-full border border-[color:var(--client-primary)] px-3 py-1.5 text-xs font-black text-[color:var(--client-primary)]" to={socialPaths.post(scope, item.postId)}>{translateText("查看动态", language)}</Link>
  }));


  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        closeTo={socialPaths.timeline(scope)}
        info="附近与好友新动态"
        title="动态通知"
      />

      <div className="grid gap-4">
        {notifications.length > 0 ? (
          <ContactEventTimeline events={timelineEvents} layout="compact-three-column" showCommentComposer={false} />
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
