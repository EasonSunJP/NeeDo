import { useMemo } from "react";
import { getLocationAreaHints } from "../../lib/location";
import { useHomeLayoutStore } from "../../state/homeLayoutStore";
import { useHomeLocationPreference } from "../../state/homeLocationStore";
import { useOptionalSocial } from "./context";
import { buildTimelineUpdateNotifications } from "./timeline-notifications";
import type { SocialPortalScope } from "./types";

export function useTimelineUnreadCount(scope: SocialPortalScope) {
  const social = useOptionalSocial();
  const { config } = useHomeLayoutStore();
  const { state: preference } = useHomeLocationPreference();
  const selectedLocation = config.locations.find((item) => item.id === config.selectedLocationId) ?? config.locations[0];
  const areaHints = useMemo(() => getLocationAreaHints(selectedLocation), [selectedLocation]);
  const coords = preference.source === "device" ? preference.coordinates : undefined;

  return useMemo(() => {
    if (!social) return 0;
    const actorKey = social.getActorForScope(scope);
    const notices = buildTimelineUpdateNotifications({
      actorKey,
      friendPosts: social.getTimelineFeed("friends", actorKey),
      nearbyPosts: social.getTimelineFeed("nearby", actorKey, { areaHints, ...(coords ? { coords } : {}) }),
      profiles: social.profiles
    });
    return notices.filter((notice) => notice.unread).length;
  }, [areaHints, coords, scope, social]);
}
