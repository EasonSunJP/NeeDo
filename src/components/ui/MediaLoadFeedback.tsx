import { useState, type CSSProperties } from "react";
import { useProvidedI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";

export function useMediaLoadState(source: string) {
  const [attempt, setAttempt] = useState({ source, number: 0, status: "loading" });
  const current = attempt.source === source ? attempt : { source, number: 0, status: "loading" };
  return {
    status: current.status,
    failed: current.status === "failed",
    key: `${source}:${current.number}`,
    onError: () => setAttempt({ ...current, status: "failed" }),
    onLoad: () => setAttempt({ ...current, status: "ready" }),
    retry: () => setAttempt({ source, number: current.number + 1, status: "loading" })
  };
}

export function MediaLoadFeedback({ kind, expired = false, className }: {
  kind: "image" | "video" | "voice";
  expired?: boolean;
  className?: string;
}) {
  const i18n = useProvidedI18n();
  const label = expired
    ? kind === "video" ? "视频已过期" : "图片已过期"
    : kind === "voice" ? "语音加载失败，点击重试"
      : kind === "video" ? "视频加载失败，点击重试" : "图片加载失败，点击重试";
  return (
    <span className={cn("flex min-h-24 w-full flex-col items-center justify-center gap-2 px-3 py-4 text-center text-xs leading-5", className)} data-media-state={expired ? "expired" : "failed"} data-no-i18n="true" role="status">
      <svg aria-hidden="true" className="h-9 w-9 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
        <path d="M20 10V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7M3 17l5-6 4 4 2-2" />
        <circle cx="17" cy="17" r="5" /><path d="M17 14v3m0 2v1" />
      </svg>
      <span>{translateText(label, i18n?.language ?? "zh")}</span>
    </span>
  );
}

export function MediaViewerResource({ kind, src, poster, expired, className, style }: {
  kind: "image" | "video";
  src: string;
  poster?: string;
  expired?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const load = useMediaLoadState(`${kind}:${src}`);
  if (expired) return <MediaLoadFeedback className="max-w-xs" expired kind={kind} />;
  if (load.failed) return <button className="pointer-events-auto w-full max-w-xs rounded-2xl bg-white/10" onClick={(event) => { event.stopPropagation(); load.retry(); }} type="button"><MediaLoadFeedback kind={kind} /></button>;
  return kind === "video"
    ? <video className={className} controls key={load.key} onError={load.onError} onLoadedMetadata={load.onLoad} playsInline poster={poster} src={src} style={style} />
    : <img alt="图片" className={className} draggable={false} key={load.key} onError={load.onError} onLoad={load.onLoad} src={src} style={style} />;
}
