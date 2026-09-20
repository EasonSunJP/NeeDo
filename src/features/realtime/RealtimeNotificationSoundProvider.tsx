import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { PortalScope } from "../../auth/portal";
import {
  getStoredPortalSettingsState,
  subscribePortalSettingsState,
  type UnifiedSettingsPortal
} from "../settings/portalSettingsState";
import { subscribeRealtimeEvents } from "./api";
import {
  createRealtimeSoundScheduler,
  type RealtimeSoundContext
} from "./realtimeNotificationSound";

const notificationSoundPath = "/audio/new-message.mp3";
const settingsPortals = new Set<PortalScope>(["user", "technician", "merchant", "business"]);

type BrowserAudio = Pick<HTMLAudioElement, "currentTime" | "muted" | "pause" | "play" | "preload">;

export function createBrowserNotificationSound(audio: BrowserAudio) {
  audio.preload = "auto";

  return {
    async unlock() {
      const previousMuted = audio.muted;

      try {
        audio.muted = true;
        audio.currentTime = 0;
        await audio.play();
        audio.pause();
      } catch {
        // Browser policy may still reject muted priming.
      } finally {
        audio.currentTime = 0;
        audio.muted = previousMuted;
      }
    },
    async play() {
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch {
        // Sound is best effort and never blocks realtime state.
      }
    },
    dispose() {
      audio.pause();
      audio.currentTime = 0;
    }
  };
}

function hasPortalSoundSetting(portal: PortalScope): portal is UnifiedSettingsPortal {
  return settingsPortals.has(portal);
}

function readSoundEnabled(portal: PortalScope | undefined) {
  return portal && hasPortalSoundSetting(portal)
    ? getStoredPortalSettingsState(portal).sound
    : true;
}

export function RealtimeNotificationSound() {
  const { isAuthenticated, isRestoring, session } = useAuth();
  const location = useLocation();
  const soundEnabled = useRef(readSoundEnabled(session?.portal));
  const context = useRef<RealtimeSoundContext>({
    currentUserId: null,
    enabled: false,
    visible: true
  });
  const scheduler = useRef<ReturnType<typeof createRealtimeSoundScheduler> | null>(null);

  context.current = {
    currentUserId: session?.id ?? null,
    enabled: isAuthenticated && !isRestoring && Boolean(session),
    visible: typeof document === "undefined" || document.visibilityState !== "hidden"
  };

  useEffect(() => {
    const audio = createBrowserNotificationSound(new Audio(notificationSoundPath));
    scheduler.current = createRealtimeSoundScheduler({ play: audio.play });
    let unlocked = false;

    const unlock = () => {
      if (unlocked) {
        return;
      }

      unlocked = true;
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      void audio.unlock();
    };

    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      scheduler.current?.dispose();
      scheduler.current = null;
      audio.dispose();
    };
  }, []);

  useEffect(() => {
    const portal = session?.portal;
    soundEnabled.current = readSoundEnabled(portal);

    if (!portal || !hasPortalSoundSetting(portal)) {
      return undefined;
    }

    return subscribePortalSettingsState(portal, (value) => {
      soundEnabled.current = value.sound;
    });
  }, [session?.portal]);

  useEffect(() => {
    scheduler.current?.reset();

    if (!isAuthenticated || isRestoring || !session || location.pathname.startsWith("/login")) {
      return undefined;
    }

    const unsubscribe = subscribeRealtimeEvents({
      onEvent(event) {
        scheduler.current?.handle(event, {
          ...context.current,
          enabled: context.current.enabled && soundEnabled.current,
          visible: document.visibilityState !== "hidden"
        });
      }
    });

    return () => {
      unsubscribe();
      scheduler.current?.reset();
    };
  }, [isAuthenticated, isRestoring, location.pathname, session?.activeIdentityId, session?.id, session?.portal]);

  return null;
}
