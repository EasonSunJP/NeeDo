import { useId } from "react";
import { Link, useLocation } from "react-router-dom";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  formatLocalizedImChatRecordCount,
  formatLocalizedImChatRecordTitle,
  deriveImChatRecordTitleKind,
  type ImChatRecordFavorite,
  type ImChatRecordSummary,
} from "./chat-records";
import type { ImRoleType } from "./model";
import { getImRoleConfig } from "./role-config";
import { useImScope } from "./scope";
import { translateImUiText as translateText } from "./ui-copy";

type CardRecord = ImChatRecordSummary | ImChatRecordFavorite;

export function ImChatRecordCard({
  record,
  scope: requestedScope,
  language: requestedLanguage,
  openerId,
  className,
}: {
  record: CardRecord;
  scope?: ImRoleType;
  language?: Language;
  openerId?: string;
  className?: string;
}) {
  const contextScope = useImScope();
  const { language: contextLanguage } = useOptionalI18n();
  const location = useLocation();
  const generatedOpenerId = useId();
  const scope = requestedScope ?? contextScope;
  const language = requestedLanguage ?? contextLanguage;
  const publicId = "bundlePublicId" in record ? record.bundlePublicId : record.publicId;
  const title = formatLocalizedImChatRecordTitle(record.senderNames, record.titleKind ?? deriveImChatRecordTitleKind(record.senderNames, record.senderCount), language);
  const viewLabel = translateText("查看聊天记录", language);
  const ariaLabel = language === "en" || language === "ko" ? `${viewLabel}: ${title}` : `${viewLabel}：${title}`;
  const stableOpenerId = openerId
    ?? ("id" in record ? `im-chat-record-favorite-${record.id}` : `im-chat-record-opener-${generatedOpenerId}`);

  return (
    <Link
      aria-label={ariaLabel}
      className={cn(
        "group block w-full rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:var(--client-surface)] p-3.5 text-left text-[color:var(--client-text)] shadow-[0_10px_26px_rgba(0,0,0,0.08)] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--client-primary)] motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
      data-im-chat-record-opener={stableOpenerId}
      id={stableOpenerId}
      state={{
        imChatRecordFallbackPath: `${location.pathname}${location.search}`,
        imChatRecordOpenerId: stableOpenerId,
      }}
      to={getImRoleConfig(scope).routes.chatRecord(publicId)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-primary)_12%,var(--client-surface))] text-[15px] font-black text-[color:var(--client-primary)]"
        >
          {record.itemCount}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-black leading-5">{title}</span>
          <span className="mt-1 block line-clamp-2 whitespace-pre-line text-[12px] font-medium leading-[18px] text-[color:var(--client-muted)]">
            {record.preview}
          </span>
          <span className="mt-2 flex items-center justify-between gap-3 border-t border-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] pt-2 text-[10px] font-black text-[color:var(--client-muted)]">
            <span>{translateText("聊天记录", language)}</span>
            <span>{formatLocalizedImChatRecordCount(record.itemCount, language)}</span>
          </span>
        </span>
      </div>
    </Link>
  );
}
