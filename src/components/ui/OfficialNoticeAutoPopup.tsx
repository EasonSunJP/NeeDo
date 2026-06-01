import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useOptionalAuth, type AuthSession } from "../../auth/AuthProvider";
import {
  readStoredOfficialNotices,
  type AdminNotice,
  type OfficialNoticeBlock
} from "../../lib/adminOfficialNotifications";
import { cn } from "../../lib/utils";
import { AppIcon } from "../client-ui/AppScaffold";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { CloseIconButton } from "./CloseIconButton";

type OfficialNoticeAutoPopupProps = {
  disabled?: boolean;
};

type HomepageTarget = "用户端" | "技师端" | "商户端" | "产运后台" | "Business";
type TargetAccountType = NonNullable<AdminNotice["targetAccount"]>["type"];

const dismissedStorageKey = "needo.official-notice-popup.dismissed.v1";
const homepagePaths = new Set(["/", "/merchant", "/merchant-admin", "/technician", "/admin", "/afirieito", "/business", "/cps", "/NDA-admin", "/CPS-admin"]);

function readDismissedNoticeIds() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(dismissedStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissedNoticeIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(dismissedStorageKey, JSON.stringify(ids.slice(-80)));
  } catch {
    // Ignore storage failures; the popup remains usable even when persistence is unavailable.
  }
}

function parseNoticeTime(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
}

function isNoticeReady(notice: AdminNotice) {
  if (notice.sendMode === "now") {
    return true;
  }

  const sendTime = parseNoticeTime(notice.at);
  if (!sendTime) {
    return notice.sendMode !== "scheduled";
  }

  return sendTime <= Date.now();
}

function getHomepageTarget(pathname: string): HomepageTarget | null {
  if (!homepagePaths.has(pathname)) {
    return null;
  }

  if (pathname === "/") {
    return "用户端";
  }

  if (pathname === "/technician") {
    return "技师端";
  }

  if (pathname === "/merchant" || pathname === "/merchant-admin") {
    return "商户端";
  }

  if (pathname === "/admin") {
    return "产运后台";
  }

  return "Business";
}

function getMatchedSessionAccountIds(session: AuthSession | null, type: TargetAccountType) {
  if (!session) {
    return [];
  }

  if (type === "user") {
    return [`user:${session.linkedCustomerId}`, session.linkedCustomerId];
  }

  if (type === "technician") {
    return [`technician:${session.linkedTechnicianId}`, session.linkedTechnicianId];
  }

  return [`store:${session.linkedStoreId}`, session.linkedStoreId];
}

function doesAccountTargetMatchHomepage(
  notice: AdminNotice,
  homepageTarget: HomepageTarget,
  session: AuthSession | null
) {
  const account = notice.targetAccount;
  if (!account) {
    return true;
  }

  const expectedHomepage =
    account.type === "user" ? "用户端" : account.type === "technician" ? "技师端" : "商户端";

  if (homepageTarget !== expectedHomepage) {
    return false;
  }

  const matchedIds = getMatchedSessionAccountIds(session, account.type);

  return matchedIds.includes(account.id);
}

function doesSegmentTargetMatchHomepage(notice: AdminNotice, homepageTarget: HomepageTarget) {
  const targetText = notice.targetSummary || notice.summary || "";

  if (!targetText || targetText.includes("全体用户")) {
    return true;
  }

  if (homepageTarget === "Business") {
    return false;
  }

  return targetText.includes(homepageTarget);
}

function doesNoticeMatchHomepage(
  notice: AdminNotice,
  homepageTarget: HomepageTarget,
  session: AuthSession | null
) {
  if (notice.targetMode === "account") {
    return doesAccountTargetMatchHomepage(notice, homepageTarget, session);
  }

  return doesSegmentTargetMatchHomepage(notice, homepageTarget);
}

function formatFileSize(size?: number) {
  if (!size) {
    return "";
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))}KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}

function NoticeBlockView({ block, index }: { block: OfficialNoticeBlock; index: number }) {
  if (block.type === "divider") {
    return <div className="border-t border-[color:color-mix(in_srgb,var(--client-line,#dfe8e3)_44%,transparent)]" />;
  }

  if (block.type === "heading") {
    return <h3 className="text-xl font-black leading-snug text-ink">{block.content}</h3>;
  }

  if (block.type === "subheading") {
    return <h4 className="text-base font-black leading-snug text-ink">{block.content}</h4>;
  }

  if (block.type === "bullet") {
    return (
      <p className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 text-sm font-bold leading-7 text-ink/75">
        <span>•</span>
        <span>{block.content}</span>
      </p>
    );
  }

  if (block.type === "numbered") {
    return (
      <p className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2 text-sm font-bold leading-7 text-ink/75">
        <span>{index + 1}.</span>
        <span>{block.content}</span>
      </p>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote className="border-l-4 border-moss/35 bg-moss/5 px-4 py-3 text-sm font-bold leading-7 text-ink/70">
        {block.content}
      </blockquote>
    );
  }

  if (block.type === "callout") {
    return (
      <div className="rounded-lg border border-lemon/35 bg-lemon/15 px-4 py-3 text-sm font-bold leading-7 text-ink/75">
        {block.content}
      </div>
    );
  }

  if (block.type === "image") {
    return (
      <figure>
        {block.content ? (
          <img
            alt={block.caption || block.fileName || "官方通知图片"}
            className="max-h-80 w-full rounded-lg border border-line object-cover"
            src={block.content}
          />
        ) : null}
        {block.caption ? <figcaption className="mt-2 text-xs font-bold text-ink/50">{block.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "video") {
    return (
      <figure>
        {block.content ? (
          <video className="max-h-80 w-full rounded-lg border border-line bg-black" controls src={block.content} />
        ) : null}
        {block.caption ? <figcaption className="mt-2 text-xs font-bold text-ink/50">{block.caption}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "file") {
    const fileLabel = block.caption || block.fileName || "下载附件";
    const fileSize = formatFileSize(block.fileSize);
    const content = (
      <>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-moss/10 text-sm font-black text-moss">档</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-ink">{fileLabel}</span>
          <span className="mt-1 block truncate text-xs font-bold text-ink/45">{fileSize || block.mimeType || "可下载文件"}</span>
        </span>
      </>
    );

    if (!block.content) {
      return <div className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3">{content}</div>;
    }

    return (
      <a
        className="flex items-center gap-3 rounded-lg border border-line bg-paper p-3 transition hover:border-moss hover:bg-white"
        download={block.fileName}
        href={block.content}
        rel="noreferrer"
        target="_blank"
      >
        {content}
      </a>
    );
  }

  return <p className="whitespace-pre-line text-sm font-bold leading-7 text-ink/75">{block.content}</p>;
}

export function OfficialNoticeAutoPopup({ disabled = false }: OfficialNoticeAutoPopupProps) {
  const location = useLocation();
  const auth = useOptionalAuth();
  const session = auth?.session ?? null;
  const [dismissedIds, setDismissedIds] = useState(readDismissedNoticeIds);
  const [refreshKey, setRefreshKey] = useState(0);
  const homepageTarget = getHomepageTarget(location.pathname);

  useEffect(() => {
    setRefreshKey((current) => current + 1);
  }, [location.pathname]);

  useEffect(() => {
    const handleStorage = () => {
      setDismissedIds(readDismissedNoticeIds());
      setRefreshKey((current) => current + 1);
    };

    window.addEventListener("storage", handleStorage);

    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const notice = useMemo(() => {
    if (disabled || !homepageTarget) {
      return null;
    }

    return readStoredOfficialNotices()
      .filter((item) => (item.level === "重要" || item.level === "紧急") && item.status !== "已归档")
      .filter((item) => !dismissedIds.includes(item.id))
      .filter(isNoticeReady)
      .filter((item) => doesNoticeMatchHomepage(item, homepageTarget, session))
      .sort((a, b) => {
        const levelDelta = (b.level === "紧急" ? 2 : 1) - (a.level === "紧急" ? 2 : 1);

        return levelDelta || parseNoticeTime(b.at) - parseNoticeTime(a.at);
      })[0] ?? null;
  }, [disabled, dismissedIds, homepageTarget, refreshKey, session]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [notice]);

  if (!notice) {
    return null;
  }

  const blocks: OfficialNoticeBlock[] = notice.blocks?.length
    ? notice.blocks
    : [{ id: "detail", type: "paragraph", content: notice.detail }];
  const dismissNotice = () => {
    const next = [...new Set([...dismissedIds, notice.id])];
    setDismissedIds(next);
    writeDismissedNoticeIds(next);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/48 px-4 py-6 backdrop-blur-sm" role="presentation">
      <section
        aria-labelledby="official-notice-popup-title"
        aria-modal="true"
        className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-[0_32px_90px_rgba(0,0,0,0.28)]"
        role="dialog"
      >
        <div
          className={cn(
            "border-b border-line px-5 py-4",
            notice.level === "紧急" ? "bg-coral/10" : "bg-lemon/18"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full",
                    notice.level === "紧急" ? "bg-coral text-white" : "bg-lemon text-ink"
                  )}
                >
                  <AppIcon className="h-5 w-5" name="bell" />
                </span>
                <Badge tone={notice.level === "紧急" ? "red" : "yellow"}>{notice.level}通知</Badge>
                {notice.targetSummary ? <Badge tone="neutral">{notice.targetSummary}</Badge> : null}
              </div>
              <h2 className="break-words text-2xl font-black leading-tight" id="official-notice-popup-title">
                {notice.title}
              </h2>
              <p className="mt-2 text-xs font-black text-ink/45">发送时间：{notice.at}</p>
            </div>
            <CloseIconButton label="关闭官方通知" onClick={dismissNotice} />
          </div>
        </div>

        <div className="max-h-[58vh] space-y-4 overflow-y-auto px-5 py-5">
          {blocks.map((block, index) => (
            <NoticeBlockView block={block} index={index} key={block.id} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-paper px-5 py-4">
          <Button onClick={dismissNotice} variant="secondary">
            我知道了
          </Button>
        </div>
      </section>
    </div>
  );
}
