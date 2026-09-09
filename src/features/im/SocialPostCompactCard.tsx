import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AvatarImage } from "../../components/ui/AvatarImage";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";

export type SocialPostCompactCardData = {
  postId: string;
  authorName: string;
  authorAvatar: string;
  text: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaThumbnailUrl?: string;
};

const copyByLanguage: Record<Language, { fallback: string; open: string }> = {
  zh: { fallback: "查看这条动态", open: "打开原动态" },
  "zh-Hant": { fallback: "查看這則動態", open: "開啟原動態" },
  ja: { fallback: "この投稿を見る", open: "元の投稿を開く" },
  en: { fallback: "View this post", open: "Open original post" },
  ko: { fallback: "이 게시물 보기", open: "원본 게시물 열기" },
};

const videoUrlPattern = /\.(?:m4v|mov|mp4|webm)(?:$|[?#])/iu;

export function resolveSocialPostCardMediaType(
  card: Pick<SocialPostCompactCardData, "mediaType" | "mediaUrl">,
) {
  if (card.mediaType) return card.mediaType;
  return card.mediaUrl && videoUrlPattern.test(card.mediaUrl)
    ? "video"
    : "image";
}

function SocialPostCardBody({
  card,
  language,
}: {
  card: SocialPostCompactCardData;
  language: Language;
}) {
  const copy = copyByLanguage[language];
  const mediaType = resolveSocialPostCardMediaType(card);
  return (
    <>
      {card.mediaUrl ? (
        mediaType === "video" ? (
          <video
            aria-hidden="true"
            className="h-36 w-full bg-black/20 object-cover"
            data-social-post-card-media="video"
            muted
            playsInline
            poster={card.mediaThumbnailUrl}
            preload="metadata"
            src={card.mediaUrl}
          />
        ) : (
          <img
            alt=""
            className="h-36 w-full object-cover"
            data-social-post-card-media="image"
            src={card.mediaUrl}
          />
        )
      ) : null}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <AvatarImage
            alt={card.authorName}
            className="h-8 w-8"
            src={card.authorAvatar}
          />
          <p className="min-w-0 flex-1 truncate text-[13px] font-black">
            {card.authorName}
          </p>
        </div>
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-5 text-[color:var(--client-muted)]">
          {card.text || copy.fallback}
        </p>
        <p className="mt-3 border-t border-[color:var(--client-line)] pt-2 text-[11px] font-black text-[color:var(--client-primary)]">
          {copy.open}
        </p>
      </div>
    </>
  );
}

export function SocialPostCompactCard({
  card,
  className,
  language = "zh",
  onOpen,
  to,
}: {
  card: SocialPostCompactCardData;
  className?: string;
  language?: Language;
  onOpen?: (postId: string) => void;
  to?: string;
}) {
  const cardClassName = cn(
    "block w-full max-w-[440px] overflow-hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:var(--client-surface)] text-left text-[color:var(--client-text)]",
    className,
  );
  const body: ReactNode = (
    <SocialPostCardBody card={card} language={language} />
  );

  if (to) {
    return (
      <Link className={cardClassName} data-social-post-compact-card to={to}>
        {body}
      </Link>
    );
  }

  return (
    <button
      className={cardClassName}
      data-social-post-compact-card
      onClick={() => onOpen?.(card.postId)}
      type="button"
    >
      {body}
    </button>
  );
}
