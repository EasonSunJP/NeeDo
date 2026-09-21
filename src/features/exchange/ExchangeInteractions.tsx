import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { useI18n } from "../../i18n/I18nProvider";
import type { MessageCenterContext } from "../../lib/messageCenter";
import { shareContent } from "../../lib/share";
import {
  createExchangeComment,
  likeExchangePost,
  listExchangeComments,
  recordExchangeShare,
  unlikeExchangePost
} from "./api";
import { exchangeText } from "./i18n";
import type { ExchangeComment, ExchangeInteractionCounts, ExchangePost, ExchangeViewerState } from "./types";

export function ExchangeInteractions({
  post,
  onCountsChange,
  context = "user",
  showActionBar = true,
  variant = "default"
}: {
  post: ExchangePost;
  onCountsChange: (counts: ExchangeInteractionCounts, viewer: Pick<ExchangeViewerState, "liked">) => void;
  context?: MessageCenterContext;
  showActionBar?: boolean;
  variant?: "default" | "detail";
}) {
  const { language } = useI18n();
  const t = (key: Parameters<typeof exchangeText>[0]) => exchangeText(key, language);
  const [comments, setComments] = useState<ExchangeComment[]>([]);
  const [commentTotal, setCommentTotal] = useState(post.counts.comments);
  const [commentPage, setCommentPage] = useState(0);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentLoadError, setCommentLoadError] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentError, setCommentError] = useState(false);
  const [actionPending, setActionPending] = useState<"like" | "share" | null>(null);
  const [actionError, setActionError] = useState(false);
  const commentKeyRef = useRef<string | null>(null);
  const active = post.status === "published";

  useEffect(() => {
    const controller = new AbortController();
    setComments([]);
    setCommentTotal(post.counts.comments);
    setCommentPage(0);
    setLoadingComments(true);
    setCommentLoadError(false);
    void listExchangeComments(String(post.id), { page: 1, pageSize: 20, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setComments(result.list);
        setCommentTotal(result.total);
        setCommentPage(result.page);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCommentLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingComments(false);
      });
    return () => controller.abort();
  }, [post.id]);

  async function loadMoreComments() {
    if (loadingComments || comments.length >= commentTotal) return;
    setLoadingComments(true);
    setCommentLoadError(false);
    try {
      const result = await listExchangeComments(String(post.id), { page: commentPage + 1, pageSize: 20 });
      setComments((current) => {
        const seen = new Set(current.map((comment) => comment.id));
        return [...current, ...result.list.filter((comment) => !seen.has(comment.id))];
      });
      setCommentPage(result.page);
      setCommentTotal(result.total);
    } catch {
      setCommentLoadError(true);
    } finally {
      setLoadingComments(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = commentText.trim();
    if (!content || commentPending) return;
    const key = commentKeyRef.current ?? globalThis.crypto.randomUUID();
    commentKeyRef.current = key;
    setCommentPending(true);
    setCommentError(false);
    try {
      const created = await createExchangeComment(String(post.id), content, key);
      const isNew = !comments.some((comment) => comment.id === created.id);
      setComments((current) => current.some((comment) => comment.id === created.id) ? current : [...current, created]);
      const nextCount = isNew ? post.counts.comments + 1 : post.counts.comments;
      setCommentTotal((current) => Math.max(current, nextCount));
      onCountsChange({ ...post.counts, comments: nextCount }, { liked: post.viewer.liked });
      setCommentText("");
      commentKeyRef.current = null;
    } catch {
      setCommentError(true);
    } finally {
      setCommentPending(false);
    }
  }

  async function toggleLike() {
    if (actionPending) return;
    setActionPending("like");
    setActionError(false);
    try {
      const counts = post.viewer.liked
        ? await unlikeExchangePost(String(post.id), globalThis.crypto.randomUUID())
        : await likeExchangePost(String(post.id), globalThis.crypto.randomUUID());
      onCountsChange(counts, { liked: !post.viewer.liked });
    } catch {
      setActionError(true);
    } finally {
      setActionPending(null);
    }
  }

  async function share() {
    if (actionPending) return;
    setActionPending("share");
    setActionError(false);
    try {
      const result = await shareContent({
        title: post.title,
        text: post.detail,
        url: typeof window === "undefined" ? "" : window.location.href
      });
      if (result.status !== "shared" && result.status !== "copied") return;
      const counts = await recordExchangeShare(String(post.id), globalThis.crypto.randomUUID());
      onCountsChange(counts, { liked: post.viewer.liked });
    } catch {
      setActionError(true);
    } finally {
      setActionPending(null);
    }
  }

  return (
    <section className="space-y-4">
      {active && showActionBar ? (
        <div className="grid grid-cols-2 gap-3">
          <button
            aria-pressed={post.viewer.liked}
            className="min-h-12 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50"
            data-action="like"
            disabled={actionPending !== null}
            onClick={() => void toggleLike()}
            type="button"
          >
            {post.viewer.liked ? "♥" : "♡"} {t(post.viewer.liked ? "unlike" : "like")} · {post.counts.likes}
          </button>
          <button
            className="min-h-12 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50"
            data-action="share"
            disabled={actionPending !== null}
            onClick={() => void share()}
            type="button"
          >
            ↗ {t("share")} · {post.counts.shares}
          </button>
        </div>
      ) : !active ? (
        <p className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 py-3 text-sm font-bold text-[color:var(--client-muted)]">{t("interactionClosed")}</p>
      ) : null}
      {actionError ? <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("interactionFailed")}</p> : null}

      <section
        className={variant === "detail"
          ? "flex flex-col rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel"
          : "flex flex-col rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5"}
        data-testid="exchange-comments-card"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[color:var(--client-text)]">{t("commentsTitle")}</h2>
          <span className="font-mono text-xs font-black text-[color:var(--client-muted)]">{commentTotal}</span>
        </div>

        {active ? (
          <form className={`mt-4 grid gap-3 ${variant === "detail" ? "order-3" : ""}`} onSubmit={submitComment}>
            <textarea
              className="min-h-24 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-3 text-sm font-semibold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]"
              maxLength={1000}
              name="comment"
              onChange={(event) => {
                const nextValue = event.target.value;
                if (nextValue.trim() !== commentText.trim()) commentKeyRef.current = null;
                setCommentText(nextValue);
              }}
              placeholder={t("commentPlaceholder")}
              value={commentText}
            />
            <button className="min-h-11 rounded-2xl bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50" data-action="comment" disabled={commentPending || !commentText.trim()} type="submit">
              {t(commentPending ? "sendingComment" : "sendComment")}
            </button>
            {commentError ? <p className="text-sm font-bold text-[color:var(--client-accent)]" role="alert">{t("commentFailed")}</p> : null}
          </form>
        ) : null}

        <div className={`${variant === "detail" ? "order-1 mt-4" : "mt-5"} space-y-3`}>
          {loadingComments && comments.length === 0 ? <p className="text-sm font-bold text-[color:var(--client-muted)]">{t("loadingComments")}</p> : null}
          {commentLoadError && comments.length === 0 ? <p className="text-sm font-bold text-[color:var(--client-accent)]">{t("commentsFailed")}</p> : null}
          {!loadingComments && !commentLoadError && comments.length === 0 ? <p className="text-sm font-bold text-[color:var(--client-muted)]">{t("emptyComments")}</p> : null}
          {comments.map((comment) => {
            const author = <>
              {comment.author.avatarUrl ? (
                <AvatarImage alt={comment.author.displayName} className="h-9 w-9 shrink-0 rounded-xl object-cover" src={comment.author.avatarUrl} />
              ) : (
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--client-primary-soft)] text-xs font-black text-[color:var(--client-primary)]">{comment.author.displayName.slice(0, 1)}</span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-[color:var(--client-text)]">{comment.author.displayName}</span>
                <span className="block truncate font-mono text-[10px] font-bold text-[color:var(--client-muted)]">{comment.author.publicId}</span>
              </span>
            </>;
            return (
              <article className="rounded-2xl bg-[color:var(--client-bg-soft)] p-4" data-no-i18n="true" key={comment.id}>
                <div className="flex items-start justify-between gap-3">
                  {comment.authorProfilePath ? (
                    <Link className="flex min-w-0 flex-1 items-center gap-3" to={`${context === "user" ? "" : `/${context}`}${comment.authorProfilePath}`}>{author}</Link>
                  ) : <div className="flex min-w-0 flex-1 items-center gap-3">{author}</div>}
                  <time className="shrink-0 text-[10px] font-bold text-[color:var(--client-muted)]">{new Date(comment.createdAt).toLocaleString()}</time>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-6 text-[color:var(--client-text)]">{comment.content}</p>
              </article>
            );
          })}
        </div>

        {comments.length < commentTotal ? (
          <button className={`${variant === "detail" ? "order-2" : ""} mt-4 min-h-11 w-full rounded-2xl border border-[color:var(--client-line)] text-sm font-black text-[color:var(--client-text)] disabled:opacity-50`} disabled={loadingComments} onClick={() => void loadMoreComments()} type="button">{t(loadingComments ? "loadingMore" : "loadMore")}</button>
        ) : null}
      </section>
    </section>
  );
}
