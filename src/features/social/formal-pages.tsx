import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AppTopBar, PageScaffold } from "../../components/client-ui/AppScaffold";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  realtimeApi,
  subscribeRealtimeEvents,
  type RealtimeNotification,
  type RealtimeSocialPost,
  type RealtimeUnreadCounts
} from "../realtime/api";
import { getSocialScopeFromPathname, socialPaths } from "./paths";
import type { SocialPortalScope } from "./types";

const panelClassName = "rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5";
const inputClassName = "w-full rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 py-3 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function useSocialScope() {
  return getSocialScopeFromPathname(useLocation().pathname);
}

function FormalSocialPage({ children, title, subtitle, onBack }: { children: ReactNode; onBack?: () => void; subtitle?: ReactNode; title: string }) {
  const scope = useSocialScope();
  return (
    <PageScaffold contentClassName="space-y-5 pb-28">
      <AppTopBar
        actions={<div className="flex gap-2"><Button size="sm" to={socialPaths.timeline(scope)} variant="secondary">动态</Button><Button size="sm" to={socialPaths.notifications(scope)} variant="secondary">通知</Button></div>}
        hideBackButton={!onBack}
        onBack={onBack}
        subtitle={subtitle}
        title={title}
      />
      {children}
    </PageScaffold>
  );
}

function ErrorNotice({ error, retry }: { error: string; retry: () => void }) {
  return <section className={`${panelClassName} border-red-300/50 bg-red-500/10 text-center`}><p className="text-sm font-black">{error}</p><Button className="mt-3" onClick={retry} size="sm" variant="secondary">重新加载</Button></section>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <section className={`${panelClassName} py-10 text-center text-sm font-bold text-[color:var(--client-muted)]`}>{children}</section>;
}

function SocialPostCard({ post, scope, onFollow }: { onFollow?: (userId: number) => void; post: RealtimeSocialPost; scope: SocialPortalScope }) {
  const { session } = useAuth();
  return (
    <article className={`${panelClassName} space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div><strong className="text-sm font-black">用户 #{post.authorUserId}</strong><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">{formatDateTime(post.createdAt)}</p></div>
        <div className="flex items-center gap-2"><Badge tone={post.visibility === "public" ? "green" : "blue"}>{post.visibility === "public" ? "公开" : "仅关注者"}</Badge>{onFollow && post.authorUserId !== session?.id ? <Button onClick={() => onFollow(post.authorUserId)} size="sm" variant="ghost">关注</Button> : null}</div>
      </div>
      <Link className="block whitespace-pre-wrap text-[15px] font-bold leading-7" to={socialPaths.post(scope, String(post.id))}>{post.content}</Link>
    </article>
  );
}

export function FormalSocialTimelinePage() {
  const scope = useSocialScope();
  const [posts, setPosts] = useState<RealtimeSocialPost[]>([]);
  const [unread, setUnread] = useState<RealtimeUnreadCounts | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followed, setFollowed] = useState<number[]>([]);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true);
    setError("");
    try {
      const [postPage, counts] = await Promise.all([
        realtimeApi.listSocialPosts({ page: nextPage, pageSize: 30 }),
        realtimeApi.unreadCounts()
      ]);
      setPosts((current) => nextPage === 1 ? postPage.list : [...current, ...postPage.list.filter((item) => !current.some((currentItem) => currentItem.id === item.id))]);
      setPage(nextPage);
      setTotal(postPage.total);
      setUnread(counts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(1); }, [load]);
  useEffect(() => subscribeRealtimeEvents({ onEvent: (event) => {
    if (event.type === "social.post.created" || event.type === "notification.created") void load(1);
  } }), [load]);

  const follow = async (targetUserId: number) => {
    setError("");
    try {
      await realtimeApi.follow(targetUserId);
      setFollowed((current) => current.includes(targetUserId) ? current : [...current, targetUserId]);
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : String(followError));
    }
  };

  return (
    <FormalSocialPage subtitle={`动态 ${total} · 未读通知 ${unread?.notifications ?? 0}`} title="动态">
      <div className="flex flex-wrap gap-2"><Button to={socialPaths.compose(scope)}>发布动态</Button><Button to={socialPaths.search(scope)} variant="secondary">搜索</Button><Button to={socialPaths.notifications(scope)} variant="secondary">通知 {unread?.notifications ?? 0}</Button></div>
      {followed.length > 0 ? <p className="text-xs font-bold text-[color:var(--client-muted)]">本次已关注用户：{followed.join("、")}</p> : null}
      {error ? <ErrorNotice error={error} retry={() => void load(1)} /> : null}
      {loading && posts.length === 0 ? <EmptyState>正在读取正式动态...</EmptyState> : null}
      {!loading && !error && posts.length === 0 ? <EmptyState>还没有正式动态。发布后会写入数据库并实时同步。</EmptyState> : null}
      <section className="space-y-4">{posts.map((post) => <SocialPostCard key={post.id} onFollow={(userId) => void follow(userId)} post={post} scope={scope} />)}</section>
      {posts.length < total ? <Button className="w-full" disabled={loading} onClick={() => void load(page + 1)} variant="secondary">{loading ? "加载中" : "加载更多"}</Button> : null}
    </FormalSocialPage>
  );
}

export function FormalSocialComposerPage() {
  const navigate = useNavigate();
  const scope = useSocialScope();
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<RealtimeSocialPost["visibility"]>("public");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const nextContent = content.trim();
    if (!nextContent || sending) return;
    setSending(true);
    setError("");
    try {
      const created = await realtimeApi.createSocialPost({ content: nextContent, visibility: visibility === "followers" ? "followers" : "public" });
      navigate(socialPaths.post(scope, String(created.id)), { replace: true });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setSending(false);
    }
  };
  return <FormalSocialPage onBack={() => navigate(-1)} subtitle="文字动态会直接写入正式数据库" title="发布动态">{error ? <ErrorNotice error={error} retry={() => setError("")} /> : null}<form className={`${panelClassName} space-y-4`} onSubmit={(event) => void submit(event)}><textarea className={`${inputClassName} min-h-48 resize-y`} maxLength={5000} onChange={(event) => setContent(event.target.value)} placeholder="输入动态内容" value={content} /><div className="flex flex-wrap gap-2"><Button onClick={() => setVisibility("public")} type="button" variant={visibility === "public" ? "primary" : "secondary"}>公开</Button><Button onClick={() => setVisibility("followers")} type="button" variant={visibility === "followers" ? "primary" : "secondary"}>仅关注者</Button></div><div className="flex items-center justify-between"><span className="text-xs font-bold text-[color:var(--client-muted)]">{content.length} / 5000</span><Button disabled={sending || !content.trim()} type="submit">{sending ? "发布中" : "正式发布"}</Button></div></form><section className={panelClassName}><Badge tone="yellow">媒体暂未开放</Badge><p className="mt-3 text-sm font-bold leading-6 text-[color:var(--client-muted)]">图片和视频将在对象存储、病毒扫描、内容审核和删除审计合同完成后开放。</p></section></FormalSocialPage>;
}

export function FormalSocialNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await realtimeApi.listNotifications({ page: 1, pageSize: 100 });
      setNotifications(page.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeRealtimeEvents({ onEvent: (event) => { if (event.type === "notification.created") void load(); } }), [load]);
  const markOne = async (notification: RealtimeNotification) => {
    if (notification.readAt) return;
    try {
      await realtimeApi.markNotificationRead(notification.id);
      await load();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    }
  };
  const markAll = async () => {
    try {
      await realtimeApi.markAllNotificationsRead();
      await load();
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    }
  };
  const unreadCount = notifications.filter((item) => !item.readAt).length;
  return <FormalSocialPage onBack={() => navigate(-1)} subtitle={`未读 ${unreadCount}`} title="通知">{error ? <ErrorNotice error={error} retry={() => void load()} /> : null}<Button disabled={unreadCount === 0} onClick={() => void markAll()} variant="secondary">全部标为已读</Button>{loading ? <EmptyState>正在读取正式通知...</EmptyState> : null}{!loading && notifications.length === 0 ? <EmptyState>还没有正式通知</EmptyState> : null}<section className="space-y-3">{notifications.map((notification) => <button className={`${panelClassName} block w-full text-left ${notification.readAt ? "opacity-65" : "ring-1 ring-[color:var(--client-primary)]"}`} key={notification.id} onClick={() => void markOne(notification)} type="button"><div className="flex items-start justify-between gap-3"><strong className="text-sm font-black">{notification.title}</strong><Badge tone={notification.readAt ? "neutral" : "blue"}>{notification.readAt ? "已读" : "未读"}</Badge></div><p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">{notification.body}</p><span className="mt-3 block text-xs font-bold text-[color:var(--client-muted)]">{formatDateTime(notification.createdAt)}</span></button>)}</section></FormalSocialPage>;
}

export function FormalSocialPostDetailPage() {
  const navigate = useNavigate();
  const scope = useSocialScope();
  const { postId } = useParams();
  const numericId = Number(postId);
  const [post, setPost] = useState<RealtimeSocialPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setPost(await realtimeApi.getSocialPost(numericId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [numericId]);
  useEffect(() => { void load(); }, [load]);
  return <FormalSocialPage onBack={() => navigate(-1)} title="动态详情">{error ? <ErrorNotice error={error} retry={() => void load()} /> : null}{loading ? <EmptyState>正在读取正式动态...</EmptyState> : null}{!loading && !post ? <EmptyState>没有找到当前动态</EmptyState> : null}{post ? <SocialPostCard post={post} scope={scope} /> : null}<section className={panelClassName}><Badge tone="yellow">互动功能分阶段开放</Badge><p className="mt-3 text-sm font-bold leading-6 text-[color:var(--client-muted)]">回复、点赞、转发、引用和收藏需要对应正式数据合同、权限和审计记录，当前不会写入本地假数据。</p></section></FormalSocialPage>;
}

export function FormalSocialSearchPage() {
  const navigate = useNavigate();
  const scope = useSocialScope();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = params.tag ?? searchParams.get("q") ?? "";
  const [posts, setPosts] = useState<RealtimeSocialPost[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { realtimeApi.listSocialPosts({ page: 1, pageSize: 100 }).then((page) => setPosts(page.list)).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError))); }, []);
  const filtered = useMemo(() => posts.filter((post) => post.content.toLowerCase().includes(query.trim().toLowerCase()) || String(post.authorUserId) === query.trim()), [posts, query]);
  return <FormalSocialPage onBack={() => navigate(-1)} title="搜索动态">{error ? <ErrorNotice error={error} retry={() => setError("")} /> : null}<input className={inputClassName} disabled={Boolean(params.tag)} onChange={(event) => setSearchParams(event.target.value ? { q: event.target.value } : {})} placeholder="搜索内容或作者用户 ID" value={query} />{query && filtered.length === 0 ? <EmptyState>没有匹配的正式动态</EmptyState> : null}<section className="space-y-4">{filtered.map((post) => <SocialPostCard key={post.id} post={post} scope={scope} />)}</section></FormalSocialPage>;
}

export function FormalSocialCapabilityPage({ title = "该动态功能" }: { title?: string }) {
  const navigate = useNavigate();
  return <FormalSocialPage onBack={() => navigate(-1)} title={title}><section className={panelClassName}><Badge tone="yellow">尚未启用</Badge><h2 className="mt-4 text-xl font-black">正式数据合同尚未完成</h2><p className="mt-3 text-sm font-bold leading-7 text-[color:var(--client-muted)]">当前不会读取或修改浏览器本地模拟数据。草稿、回复、转发、媒体查看和关注关系列表将在数据库模型、RBAC、审计与对象存储准备完成后开放。</p></section></FormalSocialPage>;
}
