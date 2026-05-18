import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName, PrimaryButton } from "../../../components/client-ui/AppScaffold";
import { AvatarImage } from "../../../components/ui/AvatarImage";
import { ShareNetworkIconPath } from "../../../components/ui/ShareNetworkIcon";
import { getGeneratedImageThumbnailUrl } from "../../../lib/imageThumbnails";
import { shareContent } from "../../../lib/share";
import { cn } from "../../../lib/utils";
import { getClientThemeClassName, useClientTheme } from "../../../theme/ClientThemeProvider";
import {
  MediaLightbox,
  MediaPlayGlyph,
  SocialEmptyState,
  SocialPostMenuActionIcon,
  UnifiedPostText,
  VerificationBadge,
  getSocialMediaPreviewUrl,
  socialMediaGridClassName,
  socialMediaTileClassName
} from "../components/SocialUi";
import { useSocial } from "../context";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import { isMutualFollow } from "../timeline";
import type { SocialPortalScope, SocialPost, SocialProfile } from "../types";
import { buildAbsoluteUrl, formatCount, formatRelativeTime, profileKey } from "../utils";

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a,button,summary,details,input,textarea,video"));
}

function formatDetailDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      timeLabel: value,
      dateLabel: value
    };
  }

  return {
    timeLabel: new Intl.DateTimeFormat("zh-CN", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date),
    dateLabel: new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(date)
  };
}

function ActionGlyph({
  name,
  active = false
}: {
  name: "reply" | "repost" | "like" | "bookmark" | "share";
  active?: boolean;
}) {
  const fill = active && name === "like" ? "currentColor" : "none";

  return (
    <svg aria-hidden="true" className="h-[18px] w-[18px]" fill={fill} viewBox="0 0 24 24">
      {name === "reply" ? (
        <path d="M8 8.5h10.5v7H12l-3.8 3v-3H8A2.5 2.5 0 0 1 5.5 13V11A2.5 2.5 0 0 1 8 8.5Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      ) : null}
      {name === "repost" ? (
        <>
          <path d="M7 8.5h8.5l-2-2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M17 15.5H8.5l2 2.2" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M15.5 6.3 17.8 8.5 15.5 10.7M8.5 13.3 6.2 15.5 8.5 17.7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </>
      ) : null}
      {name === "like" ? (
        <path d="M12 19.2s-6.8-4.3-8.6-8.3C2 7.8 4 5.2 7 5.2c1.8 0 3.2.8 5 2.9 1.8-2.1 3.2-2.9 5-2.9 3 0 5 2.6 3.6 5.7-1.8 4-8.6 8.3-8.6 8.3Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      ) : null}
      {name === "bookmark" ? (
        <path d="M7 5.8h10v12.4l-5-3.2-5 3.2V5.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      ) : null}
      {name === "share" ? (
        <ShareNetworkIconPath strokeWidth={2.1} />
      ) : null}
    </svg>
  );
}

function SocialPostDetailBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="返回"
      className={cn(floatingHeaderControlButtonClassName, "shrink-0 text-white")}
      onClick={onClick}
      type="button"
    >
      <AppIcon className="h-5 w-5" name="back" />
      <span className="sr-only">返回</span>
    </button>
  );
}

function DetailActionButton({
  icon,
  label,
  count,
  to,
  onClick,
  active = false,
  disabled = false,
  tone = "default"
}: {
  icon: "reply" | "repost" | "like" | "bookmark" | "share";
  label: string;
  count?: number;
  to?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
}) {
  const content = (
    <>
      <ActionGlyph active={active} name={icon} />
      <span>{count === undefined ? label : formatCount(count)}</span>
    </>
  );

  const className = cn(
    "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[13px] font-semibold transition hover:bg-white/[0.05]",
    disabled
      ? "cursor-not-allowed text-white/24 hover:bg-transparent hover:text-white/24"
      : tone === "danger" && active
        ? "text-[#ff6b8b]"
        : tone === "primary" && active
          ? "text-[#d1ff4d]"
          : active
            ? "text-white"
            : "text-white/56 hover:text-white"
  );

  if (to && !disabled) {
    return (
      <Link className={className} to={to}>
        {content}
      </Link>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={onClick} type="button">
      {content}
    </button>
  );
}

function DetailPostMenu({
  post,
  scope,
  actorKey
}: {
  post: SocialPost;
  scope: SocialPortalScope;
  actorKey: string;
}) {
  const { deletePost, profiles, togglePinPost } = useSocial();
  const isMine = profileKey({ entityType: post.authorType, id: post.authorId }) === actorKey;
  const isPinned = profiles[actorKey]?.pinnedPostId === post.id;
  const menuItemClassName = "flex w-full items-center gap-2 rounded-[16px] px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-white/[0.06]";

  return (
    <details className="relative" onClick={(event) => event.stopPropagation()}>
      <summary aria-label="更多操作" className="cursor-pointer list-none rounded-full p-2 text-white/54 transition hover:bg-white/[0.06] hover:text-white">
        <span className="sr-only">更多操作</span>
        <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
          <path d="M12 6.5a1.5 1.5 0 1 0 0 .01M12 12a1.5 1.5 0 1 0 0 .01M12 17.5a1.5 1.5 0 1 0 0 .01" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        </svg>
      </summary>
      <div className="absolute right-0 top-[calc(100%+8px)] z-20 min-w-[184px] rounded-[22px] border border-white/12 bg-[#101010]/96 p-1.5 shadow-[0_20px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl">
        {isMine ? (
          <Link className={menuItemClassName} to={socialPaths.compose(scope, { editPostId: post.id })}>
            编辑动态
          </Link>
        ) : null}
        {isMine && !post.replyToPostId ? (
          <button
            className={menuItemClassName}
            onClick={() => togglePinPost(post.id, actorKey)}
            type="button"
          >
            {isPinned ? "取消置顶" : "置顶"}
          </button>
        ) : null}
        <Link className={menuItemClassName} to={socialPaths.repost(scope, post.id)}>
          转发 / 引用
        </Link>
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon name="translate" />
          <span>翻译</span>
        </button>
        {isMine ? (
          <button
            className={cn(menuItemClassName, "text-[#ff7b73]")}
            onClick={() => deletePost(post.id, actorKey)}
            type="button"
          >
            删除动态
          </button>
        ) : null}
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon name="report" />
          <span>举报</span>
        </button>
        <button className={menuItemClassName} type="button">
          <SocialPostMenuActionIcon className="text-white" name="block" />
          <span>屏蔽</span>
        </button>
      </div>
    </details>
  );
}

function DetailMiniPostCard({
  post,
  scope,
  profiles,
  caption,
  chrome = "framed"
}: {
  post: SocialPost;
  scope: SocialPortalScope;
  profiles: Record<string, SocialProfile>;
  caption?: string;
  chrome?: "framed" | "plain";
}) {
  const navigate = useNavigate();
  const author = profiles[profileKey({ entityType: post.authorType, id: post.authorId })];
  const leadMedia = post.media[0];

  if (!author) {
    return null;
  }

  return (
    <article
      className={cn(
        "cursor-pointer rounded-[24px] p-3.5 transition hover:bg-white/[0.06]",
        chrome === "plain" ? "bg-white/[0.03]" : "border border-white/12 bg-white/[0.04]"
      )}
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) {
          return;
        }

        navigate(socialPaths.post(scope, post.id));
      }}
    >
      {caption ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#d1ff4d]/84">{caption}</p> : null}

      <div className={cn("flex items-center gap-2", caption ? "mt-2.5" : "")}>
        <AvatarImage alt={author.displayName} className="h-8 w-8" src={author.avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="truncate font-bold text-white">{author.displayName}</span>
            <VerificationBadge status={author.verifiedStatus} />
            <span className="text-white/46">{formatRelativeTime(post.createdAt)}</span>
          </div>
        </div>
      </div>

      {post.text ? <UnifiedPostText allowExpand={false} className="mt-2.5 text-[14px] leading-6 text-white" expanded profiles={profiles} scope={scope} text={post.text} /> : null}

      {leadMedia ? (
        <div className={cn("relative mt-3 h-40 overflow-hidden bg-black", chrome === "plain" ? "" : "border border-white/8")}>
          {leadMedia.type === "video" ? (
            <video className="absolute inset-0 h-full w-full scale-[1.035] object-cover" muted playsInline poster={leadMedia.thumbnailUrl ? getGeneratedImageThumbnailUrl(leadMedia.thumbnailUrl) : undefined} src={leadMedia.url} />
          ) : (
            <img alt={leadMedia.alt ?? ""} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getSocialMediaPreviewUrl(leadMedia)} />
          )}
        </div>
      ) : null}
    </article>
  );
}

function DetailMediaBlock({
  post,
  scope
}: {
  post: SocialPost;
  scope: SocialPortalScope;
}) {
  const [activeMediaIndex, setActiveMediaIndex] = useState<number | null>(null);

  if (post.media.length === 0) {
    return null;
  }

  const single = post.media.length === 1 ? post.media[0] : null;

  if (single?.type === "video") {
    return (
      <>
        <button className="group relative mt-4 block aspect-[4/5] w-full overflow-hidden border border-white/10 bg-black p-0 text-left" onClick={() => setActiveMediaIndex(0)} type="button">
          <video
            className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
            muted
            playsInline
            poster={single.thumbnailUrl ? getGeneratedImageThumbnailUrl(single.thumbnailUrl) : undefined}
            src={single.url}
          />
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-black/58 text-white shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
              <MediaPlayGlyph className="ml-0.5 h-5 w-5" />
            </span>
          </span>
        </button>
        {activeMediaIndex !== null ? <MediaLightbox activeIndex={activeMediaIndex} media={post.media} onChange={setActiveMediaIndex} onClose={() => setActiveMediaIndex(null)} /> : null}
      </>
    );
  }

  if (single?.type === "image") {
    return (
      <>
        <button className="relative mt-4 block aspect-[4/5] w-full overflow-hidden border border-white/10 bg-black p-0 text-left" onClick={() => setActiveMediaIndex(0)} type="button">
          <img alt={single.alt ?? ""} className="absolute inset-0 h-full w-full scale-[1.035] object-cover" src={getSocialMediaPreviewUrl(single)} />
        </button>
        {activeMediaIndex !== null ? <MediaLightbox activeIndex={activeMediaIndex} media={post.media} onChange={setActiveMediaIndex} onClose={() => setActiveMediaIndex(null)} /> : null}
      </>
    );
  }

  const visibleMedia = post.media.slice(0, 9);
  const hiddenCount = Math.max(0, post.media.length - visibleMedia.length);
  const total = visibleMedia.length;

  return (
    <>
      <div className={cn("mt-4 grid gap-1 overflow-hidden border border-white/10 bg-white/10", socialMediaGridClassName(total))}>
        {visibleMedia.map((media, index) => (
          <button
            className={cn("group relative block w-full overflow-hidden border-0 bg-black p-0 text-left", socialMediaTileClassName(total, index))}
            key={media.id}
            onClick={() => setActiveMediaIndex(index)}
            type="button"
          >
            {media.type === "video" ? (
              <>
                <video
                  className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]"
                  muted
                  playsInline
                  poster={media.thumbnailUrl ? getGeneratedImageThumbnailUrl(media.thumbnailUrl) : undefined}
                  src={media.url}
                />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-black/58 text-white shadow-[0_12px_28px_rgba(0,0,0,0.3)]">
                    <MediaPlayGlyph className="ml-0.5 h-4 w-4" />
                  </span>
                </div>
                <span className="absolute left-3 bottom-3 rounded-full bg-black/68 px-2.5 py-1 text-[11px] font-black text-white">
                  {media.durationLabel ?? "视频"}
                </span>
              </>
            ) : (
              <img alt={media.alt ?? ""} className="absolute inset-0 h-full w-full scale-[1.035] object-cover transition duration-300 group-hover:scale-[1.06]" src={getSocialMediaPreviewUrl(media)} />
            )}

            {index === visibleMedia.length - 1 && hiddenCount > 0 ? <div className="absolute inset-0 grid place-items-center bg-black/52 text-xl font-black text-white">+{hiddenCount}</div> : null}
          </button>
        ))}
      </div>
      {activeMediaIndex !== null ? <MediaLightbox activeIndex={activeMediaIndex} media={post.media} onChange={setActiveMediaIndex} onClose={() => setActiveMediaIndex(null)} /> : null}
    </>
  );
}

function ReplyListItem({
  post,
  scope,
  profiles
}: {
  post: SocialPost;
  scope: SocialPortalScope;
  profiles: Record<string, SocialProfile>;
}) {
  const navigate = useNavigate();
  const { getPostById } = useSocial();
  const author = profiles[profileKey({ entityType: post.authorType, id: post.authorId })];
  const quotedPost = post.quotePostId ? getPostById(post.quotePostId) : undefined;

  if (!author) {
    return null;
  }

  return (
    <article
      className="cursor-pointer border-b border-white/8 px-4 py-4 transition hover:bg-white/[0.03] last:border-none"
      onClick={(event) => {
        if (shouldIgnoreCardNavigation(event.target)) {
          return;
        }

        navigate(socialPaths.post(scope, post.id));
      }}
    >
      <div className="flex items-start gap-3">
        <Link className="shrink-0" to={socialPaths.profile(scope, author)}>
          <AvatarImage alt={author.displayName} className="h-10 w-10" src={author.avatar} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link className="truncate text-[15px] font-black text-white" to={socialPaths.profile(scope, author)}>
              {author.displayName}
            </Link>
            <VerificationBadge status={author.verifiedStatus} />
            <span className="text-[13px] text-white/46">{formatRelativeTime(post.createdAt)}</span>
          </div>

          {post.text ? <UnifiedPostText allowExpand={false} className="mt-2 text-[15px] leading-7 text-white" expanded profiles={profiles} scope={scope} text={post.text} /> : null}

          {quotedPost ? (
            <div className="mt-3">
              <DetailMiniPostCard caption="引用动态" post={quotedPost} profiles={profiles} scope={scope} />
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[12px] font-semibold text-white/42">
            <span>{formatCount(post.replyCount)} 回复</span>
            <span>{formatCount(post.repostCount)} 转发</span>
            <span>{formatCount(post.likeCount)} 喜欢</span>
            <span>{formatCount(post.viewCount)} 浏览</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function QuickReplyComposer({
  actor,
  actorKey,
  postId,
  canComment
}: {
  actor?: SocialProfile;
  actorKey: string;
  postId: string;
  canComment: boolean;
}) {
  const { createPost } = useSocial();
  const [text, setText] = useState("");
  const canSubmit = canComment && text.trim().length > 0;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    createPost({
      authorKey: actorKey,
      replyToPostId: postId,
      text: text.trim(),
      postType: "reply"
    });
    setText("");
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[linear-gradient(180deg,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.96)_100%)] backdrop-blur-xl">
      <div className="safe-panel-bottom mx-auto max-w-[720px] px-4 pt-3">
        <form className="flex items-center gap-3" onSubmit={handleSubmit}>
          <AvatarImage alt={actor?.displayName ?? "当前账号"} className="h-10 w-10 shrink-0" src={actor?.avatar ?? ""} />
          <label className="min-w-0 flex-1">
            <span className="sr-only">发布回复</span>
              <input
              className="h-11 w-full rounded-full border border-white/10 bg-white/[0.06] px-4 text-[14px] text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed disabled:text-white/30 focus:border-white/22 focus:bg-white/[0.08]"
              disabled={!canComment}
              onChange={(event) => setText(event.target.value)}
              placeholder={canComment ? "发布你的回复" : "仅好友可以评论"}
              value={text}
            />
          </label>
          <button
            className={cn(
              "inline-flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-sm font-black transition",
              canSubmit ? "bg-[#d1ff4d] text-black" : "bg-white/[0.12] text-white/34"
            )}
            disabled={!canSubmit}
            type="submit"
          >
            回复
          </button>
        </form>
      </div>
    </div>
  );
}

export function SocialPostDetailPage() {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const {
    state,
    profiles,
    getActorForScope,
    getPostById,
    getInteractionState,
    getAncestors,
    getReplies,
    getRelatedPosts,
    incrementView,
    markShared,
    toggleBookmark,
    toggleLike
  } = useSocial();
  const actorKey = getActorForScope(scope);
  const actor = profiles[actorKey];
  const post = postId ? getPostById(postId, actorKey) : undefined;
  const postAuthorKey = post ? profileKey({ entityType: post.authorType, id: post.authorId }) : "";
  const author = post ? profiles[postAuthorKey] : undefined;
  const { theme } = useClientTheme();
  const shellClassName = cn("client-shell client-theme-night min-h-[100dvh] bg-[#000000] text-white", getClientThemeClassName(theme));
  const quotedPost = post?.quotePostId ? getPostById(post.quotePostId, actorKey) : undefined;
  const ancestors = useMemo(() => (postId ? getAncestors(postId) : []), [getAncestors, postId]);
  const replies = useMemo(() => (postId ? getReplies(postId) : []), [getReplies, postId]);
  const relatedPosts = useMemo(() => (postId ? getRelatedPosts(postId).slice(0, 4) : []), [getRelatedPosts, postId]);
  const viewedRef = useRef<string | null>(null);
  const isThreadPage = location.pathname.endsWith("/replies");

  useEffect(() => {
    if (!postId || viewedRef.current === postId) {
      return;
    }

    viewedRef.current = postId;
    incrementView(postId);
  }, [incrementView, postId]);

  if (!post) {
    return (
      <div className={shellClassName}>
        <header className="safe-header-top fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/84 backdrop-blur-xl">
          <div className="mx-auto flex h-[52px] max-w-[720px] items-center gap-3 px-4">
            <SocialPostDetailBackButton onClick={() => navigate(-1)} />
            <p className="text-[20px] font-black text-white">帖子</p>
          </div>
        </header>

        <main className="mx-auto max-w-[720px] px-4 pb-20 pt-[92px]">
          <SocialEmptyState
            action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态页</PrimaryButton>}
            description="这条动态可能已删除，或当前链接已经失效。"
            title="动态不存在"
          />
        </main>
      </div>
    );
  }

  const { timeLabel, dateLabel } = formatDetailDate(post.createdAt);
  const interaction = getInteractionState(post.id, actorKey);
  const canComment = post.commentPermission !== "friends" || postAuthorKey === actorKey || isMutualFollow(state.follows, actorKey, postAuthorKey);

  return (
    <div className={shellClassName}>
      <header className="safe-header-top fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-black/84 backdrop-blur-xl">
        <div className="mx-auto flex h-[52px] max-w-[720px] items-center gap-3 px-4">
          <SocialPostDetailBackButton onClick={() => navigate(-1)} />
          <p className="text-[20px] font-black text-white">{isThreadPage ? "回复" : "帖子"}</p>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 pb-[152px] pt-[92px]">
        {ancestors.length > 0 ? (
          <section className="space-y-3 pb-4">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/42">回复上下文</p>
            {ancestors.map((ancestor) => (
              <DetailMiniPostCard caption="上一条动态" key={ancestor.id} post={ancestor} profiles={profiles} scope={scope} />
            ))}
          </section>
        ) : null}

        <article className="border-b border-white/10 pb-5">
          <div className="flex items-start gap-3">
            <Link className="shrink-0" to={author ? socialPaths.profile(scope, author) : socialPaths.timeline(scope)}>
              <AvatarImage alt={author?.displayName ?? "动态作者"} className="h-11 w-11" src={author?.avatar ?? ""} />
            </Link>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Link className="truncate text-[16px] font-black text-white" to={author ? socialPaths.profile(scope, author) : socialPaths.timeline(scope)}>
                      {author?.displayName ?? "动态作者"}
                    </Link>
                    {author ? <VerificationBadge status={author.verifiedStatus} /> : null}
                  </div>
                  {author?.headline ? <p className="mt-1 text-[12px] font-semibold text-white/42">{author.headline}</p> : null}
                </div>

                <DetailPostMenu actorKey={actorKey} post={post} scope={scope} />
              </div>

              {post.text ? <UnifiedPostText allowExpand={false} className="mt-3 text-[19px] leading-8 text-white sm:text-[21px]" expanded profiles={profiles} scope={scope} text={post.text} /> : null}

              {quotedPost ? (
                <div className="mt-4">
                  <DetailMiniPostCard caption="引用动态" post={quotedPost} profiles={profiles} scope={scope} />
                </div>
              ) : null}

              <DetailMediaBlock post={post} scope={scope} />

              <p className="mt-4 text-[14px] text-white/42">
                {timeLabel} · {dateLabel} · {formatCount(post.viewCount)} 次浏览
              </p>

              <div className="mt-4 py-2">
                <div className="grid grid-cols-5 items-center gap-1">
                  <DetailActionButton count={post.replyCount} disabled={!canComment} icon="reply" label="回复" to={socialPaths.compose(scope, { replyToPostId: post.id })} />
                  <DetailActionButton active={interaction.reposted} count={post.repostCount} icon="repost" label="转发" to={socialPaths.repost(scope, post.id)} tone="primary" />
                  <DetailActionButton active={interaction.liked} count={post.likeCount} icon="like" label="喜欢" onClick={() => toggleLike(post.id, actorKey)} tone="danger" />
                  <DetailActionButton active={interaction.bookmarked} count={post.bookmarkCount} icon="bookmark" label="收藏" onClick={() => toggleBookmark(post.id, actorKey)} tone="primary" />
                  <DetailActionButton
                    active={interaction.shared}
                    icon="share"
                    label="分享"
                    onClick={async () => {
                      const result = await shareContent({
                        title: post.text ? `${post.text.slice(0, 32)}${post.text.length > 32 ? "..." : ""} | NeeDo` : "NeeDo 动态",
                        text: "在 NeeDo 查看这条动态",
                        url: buildAbsoluteUrl(socialPaths.post(scope, post.id))
                      });

                      if (result.status !== "cancelled" && result.status !== "unsupported") {
                        markShared(post.id, actorKey);
                      }
                    }}
                    tone="primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </article>

        <section className="pt-4">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-[18px] font-black text-white">{isThreadPage ? "全部回复" : "回复列表"}</h2>
              <p className="mt-1 text-[13px] text-white/42">{replies.length > 0 ? `${formatCount(replies.length)} 条公开回复` : "从这里继续这个讨论串"}</p>
            </div>
            {canComment ? (
              <Link className="text-[13px] font-semibold text-[#d1ff4d]" to={socialPaths.compose(scope, { replyToPostId: post.id })}>
                写回复
              </Link>
            ) : (
              <span className="text-[13px] font-semibold text-white/28">仅好友可评论</span>
            )}
          </div>

          {replies.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
              {replies.map((reply) => (
                <ReplyListItem key={reply.id} post={reply} profiles={profiles} scope={scope} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[28px] border border-white/10 bg-white/[0.03] px-4 py-5">
              <p className="text-[15px] font-semibold text-white">还没有公开回复</p>
              <p className="mt-2 text-sm leading-7 text-white/46">你可以从底部输入框直接回复，也可以进入完整发帖页继续补充文字、图片和引用内容。</p>
            </div>
          )}
        </section>

        {relatedPosts.length > 0 ? (
          <section className="pt-5">
            <div className="border-b border-white/10 pb-3">
              <h2 className="text-[18px] font-black text-white">相关引用</h2>
              <p className="mt-1 text-[13px] text-white/42">转发和引用这条动态的内容会继续沉淀在这里。</p>
            </div>

            <div className="mt-4 space-y-3">
              {relatedPosts.map((related) => (
                <DetailMiniPostCard chrome="plain" key={related.id} post={related} profiles={profiles} scope={scope} />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <QuickReplyComposer actor={actor} actorKey={actorKey} canComment={canComment} postId={post.id} />
    </div>
  );
}
