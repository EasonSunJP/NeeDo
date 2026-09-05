import { useEffect, useState, type CSSProperties } from "react";
import {
  MediaLoadFeedback,
  MediaViewerResource,
} from "../../components/ui/MediaLoadFeedback";
import { useProvidedI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { resolveImNoStoreMediaSource } from "./media-source";
import type { ConversationMessage } from "./model";

export type OpenedImMediaViewerCache = {
  cacheOpenedMedia(message: ConversationMessage, source: string): Promise<
    | { state: "expired" }
    | {
        blob: Blob;
        cacheState: "skipped" | "stored" | "unavailable";
        state: "ready";
      }
  >;
  getCachedMediaObjectUrl(conversationId: string, messageId: string): Promise<string | undefined>;
  releaseCachedMediaObjectUrl(conversationId: string, messageId: string): void;
};

export function OpenedImMediaViewer({
  cache,
  className,
  message,
  onResolvedSourceChange,
  poster,
  style,
}: {
  cache: OpenedImMediaViewerCache;
  className?: string;
  message: ConversationMessage;
  onResolvedSourceChange?: (source: string | undefined) => void;
  poster?: string;
  style?: CSSProperties;
}) {
  const i18n = useProvidedI18n();
  const {
    cacheOpenedMedia,
    getCachedMediaObjectUrl,
    releaseCachedMediaObjectUrl,
  } = cache;
  const remoteSource = resolveImNoStoreMediaSource(
    message.ext?.url ?? message.content,
  );
  const resolvedPoster = poster ? resolveImNoStoreMediaSource(poster) : undefined;
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<{
    cacheUnavailable?: boolean;
    key: string;
    source?: string;
    status: "expired" | "failed" | "loading" | "ready";
  }>(() => ({ key: `${message.conversationId}:${message.id}`, status: "loading" }));
  const key = `${message.conversationId}:${message.id}`;
  const current = resolved.key === key ? resolved : { key, status: "loading" as const };

  useEffect(() => {
    let disposed = false;
    let transientSource: string | undefined;
    setResolved({ key, status: "loading" });
    onResolvedSourceChange?.(undefined);
    void getCachedMediaObjectUrl(message.conversationId, message.id)
      .then(async (cachedSource) => {
        if (disposed) {
          if (cachedSource) {
            releaseCachedMediaObjectUrl(message.conversationId, message.id);
          }
          return;
        }
        if (cachedSource) {
          setResolved({ key, source: cachedSource, status: "ready" });
          onResolvedSourceChange?.(cachedSource);
          return;
        }
        if (message.ext?.mediaState === "expired" || !remoteSource) {
          setResolved({ key, status: "expired" });
          return;
        }

        const result = await cacheOpenedMedia(message, remoteSource);
        if (disposed) return;
        if (result.state === "expired") {
          setResolved({ key, status: "expired" });
          return;
        }
        transientSource = URL.createObjectURL(result.blob);
        setResolved({
          cacheUnavailable: result.cacheState === "unavailable",
          key,
          source: transientSource,
          status: "ready",
        });
        onResolvedSourceChange?.(transientSource);
      })
      .catch(() => {
        if (!disposed) setResolved({ key, status: "failed" });
      });

    return () => {
      disposed = true;
      if (transientSource) URL.revokeObjectURL(transientSource);
      releaseCachedMediaObjectUrl(message.conversationId, message.id);
      onResolvedSourceChange?.(undefined);
    };
  }, [attempt, cacheOpenedMedia, getCachedMediaObjectUrl, key, message, onResolvedSourceChange, releaseCachedMediaObjectUrl, remoteSource]);

  if (current.status === "loading") {
    return (
      <span
        aria-busy="true"
        className="block w-full max-w-xs py-6 text-center text-sm text-white/70"
        data-media-state="loading"
      >
        {translateText("正在读取本地媒体...", i18n?.language ?? "zh")}
      </span>
    );
  }

  if (current.status === "expired") {
    return <MediaLoadFeedback className="max-w-xs" expired kind={message.type === "video" ? "video" : "image"} />;
  }

  if (current.status === "failed" || !current.source) {
    return (
      <button
        className="pointer-events-auto w-full max-w-xs rounded-2xl bg-white/10"
        onClick={(event) => {
          event.stopPropagation();
          setAttempt((value) => value + 1);
        }}
        type="button"
      >
        <MediaLoadFeedback kind={message.type === "video" ? "video" : "image"} />
      </button>
    );
  }

  return (
    <div className="flex max-h-full max-w-full flex-col items-center gap-3">
      <MediaViewerResource
        className={className}
        kind={message.type === "video" ? "video" : "image"}
        poster={resolvedPoster}
        src={current.source}
        style={style}
      />
      {current.cacheUnavailable ? (
        <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs text-amber-100" role="status">
          {translateText("媒体已显示，但本地缓存不可用", i18n?.language ?? "zh")}
        </span>
      ) : null}
    </div>
  );
}
