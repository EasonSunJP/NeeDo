import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  realtimeApi,
  subscribeRealtimeEvents,
  type RealtimeContact,
  type RealtimeConversation,
  type RealtimeFriendRequest,
  type RealtimeMessage,
  type RealtimeUnreadCounts
} from "../realtime/api";
import { ImStandaloneShell, ImTopBar } from "./components";
import { useImScope } from "./scope";
import type { ImRoleType } from "./model";

const inputClassName = "h-11 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";

function scopePaths(scope: ImRoleType) {
  const base = scope === "user" ? "" : `/${scope}`;
  return {
    contacts: `${base}/contacts`,
    friendRequests: `${base}/contacts/requests`,
    messages: `${base}/messages`,
    newConversation: `${base}/messages/new`,
    search: `${base}/im/search`
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function getConversationTitle(conversation: RealtimeConversation, currentUserId?: number) {
  if (conversation.title) return conversation.title;
  const others = conversation.participants.filter((participant) => participant.userId !== currentUserId);
  return (others.length ? others : conversation.participants).map((participant) => participant.username).join("、") || `会话 #${conversation.id}`;
}

function extractConversationId(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { conversationId?: unknown }).conversationId;
  return typeof value === "number" ? value : null;
}

function FormalPage({ title, children, onBack, action }: { title: string; children: ReactNode; onBack?: () => void; action?: ReactNode }) {
  return (
    <ImStandaloneShell>
      <ImTopBar actions={action} onBack={onBack} title={title} />
      <main className="space-y-4 px-4 pb-28 pt-4 text-[color:var(--client-text)]">{children}</main>
    </ImStandaloneShell>
  );
}

function ErrorNotice({ error, retry }: { error: string; retry: () => void }) {
  return (
    <section className="rounded-[22px] border border-red-300/50 bg-red-500/10 p-5 text-center">
      <p className="text-sm font-black">{error}</p>
      <Button className="mt-3" onClick={retry} size="sm" variant="secondary">重新加载</Button>
    </section>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <section className="rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-8 text-center text-sm font-bold text-[color:var(--client-muted)]">{children}</section>;
}

function ConversationListContent({ conversations }: { conversations: RealtimeConversation[] }) {
  const { session } = useAuth();
  const scope = useImScope();
  const paths = scopePaths(scope);

  return (
    <section className="overflow-hidden rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]">
      {conversations.map((conversation) => {
        const title = getConversationTitle(conversation, session?.id);
        return (
          <Link className="flex items-center gap-3 border-b border-[color:var(--client-line)] px-4 py-4 last:border-b-0" key={conversation.id} to={`${paths.messages}/${conversation.id}`}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary)] text-lg font-black text-[color:var(--client-primary-contrast)]">{title.slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm font-black">{title}</strong><span className="mt-1 block truncate text-xs font-bold text-[color:var(--client-muted)]">{conversation.lastMessage?.content ?? "还没有消息"}</span></span>
            <span className="shrink-0 text-right"><span className="block text-[10px] font-bold text-[color:var(--client-muted)]">{formatDateTime(conversation.updatedAt)}</span>{conversation.unreadCount > 0 ? <span className="mt-2 inline-grid min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">{conversation.unreadCount}</span> : null}</span>
          </Link>
        );
      })}
    </section>
  );
}

export function FormalImMessagesEntryPage() {
  const scope = useImScope();
  const paths = scopePaths(scope);
  const [conversations, setConversations] = useState<RealtimeConversation[]>([]);
  const [unread, setUnread] = useState<RealtimeUnreadCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [conversationPage, counts] = await Promise.all([
        realtimeApi.listConversations({ page: 1, pageSize: 50 }),
        realtimeApi.unreadCounts()
      ]);
      setConversations(conversationPage.list);
      setUnread(counts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);
  useEffect(() => subscribeRealtimeEvents({ onEvent: () => setRevision((current) => current + 1) }), []);

  return (
    <FormalPage
      action={<div className="flex gap-2"><Button size="sm" to={paths.contacts} variant="secondary">联系人</Button><Button size="sm" to={paths.newConversation}>新会话</Button></div>}
      title="消息"
    >
      <div className="flex flex-wrap gap-2"><Badge tone="blue">未读消息 {unread?.conversations ?? 0}</Badge><Badge tone="yellow">好友申请 {unread?.friendRequests ?? 0}</Badge><Button size="sm" to={paths.search} variant="ghost">搜索</Button></div>
      {error ? <ErrorNotice error={error} retry={() => setRevision((current) => current + 1)} /> : null}
      {loading ? <EmptyState>正在读取正式会话...</EmptyState> : null}
      {!loading && !error && conversations.length === 0 ? <EmptyState>还没有正式会话。可从联系人或用户 ID 创建会话。</EmptyState> : null}
      {!loading && conversations.length > 0 ? <ConversationListContent conversations={conversations} /> : null}
    </FormalPage>
  );
}

export function FormalImConversationRoomRoutePage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const scope = useImScope();
  const { session } = useAuth();
  const numericId = Number(conversationId);
  const [conversation, setConversation] = useState<RealtimeConversation | null>(null);
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError("会话 ID 不正确");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [conversationPage, history] = await Promise.all([
        realtimeApi.listConversations({ page: 1, pageSize: 100 }),
        realtimeApi.listMessages(numericId, { pageSize: 50 })
      ]);
      setConversation(conversationPage.list.find((item) => item.id === numericId) ?? null);
      setMessages([...history.list].reverse());
      setNextCursor(history.nextCursor);
      await realtimeApi.markConversationRead(numericId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [numericId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => subscribeRealtimeEvents({
    onEvent: (event) => {
      if (event.type === "message.created" && extractConversationId(event.payload) === numericId) void load();
    }
  }), [load, numericId]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    const history = await realtimeApi.listMessages(numericId, { beforeId: nextCursor, pageSize: 50 });
    setMessages((current) => [...history.list.reverse(), ...current]);
    setNextCursor(history.nextCursor);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await realtimeApi.createMessage(numericId, { content, type: "text" });
      setMessages((current) => [...current, message]);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setSending(false);
    }
  };

  const title = conversation ? getConversationTitle(conversation, session?.id) : "会话";
  return (
    <FormalPage action={conversation ? <Button size="sm" to={`${scopePaths(scope).messages}/${numericId}/info`} variant="secondary">详情</Button> : null} onBack={() => navigate(-1)} title={title}>
      {error ? <ErrorNotice error={error} retry={() => void load()} /> : null}
      {loading ? <EmptyState>正在读取正式消息记录...</EmptyState> : null}
      {nextCursor ? <Button className="w-full" onClick={() => void loadOlder()} size="sm" variant="ghost">加载更早消息</Button> : null}
      <section className="space-y-3 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
        {!loading && messages.length === 0 ? <p className="py-8 text-center text-sm font-bold text-[color:var(--client-muted)]">还没有消息</p> : null}
        {messages.map((message) => {
          const mine = message.senderUserId === session?.id;
          return <article className={`flex ${mine ? "justify-end" : "justify-start"}`} key={message.id}><div className={`max-w-[82%] rounded-[20px] px-4 py-3 ${mine ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "bg-[color:var(--client-bg)]"}`}><p className="whitespace-pre-wrap text-sm font-bold leading-6">{message.content}</p><span className="mt-1 block text-[10px] font-semibold opacity-60">{formatDateTime(message.createdAt)}</span></div></article>;
        })}
      </section>
      <form className="sticky bottom-4 flex gap-2 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-3 shadow-panel" onSubmit={(event) => void send(event)}><input className={inputClassName} maxLength={4000} onChange={(event) => setDraft(event.target.value)} placeholder="输入文字消息" value={draft} /><Button disabled={sending || !draft.trim()} type="submit">{sending ? "发送中" : "发送"}</Button></form>
    </FormalPage>
  );
}

export function FormalImContactsListPage() {
  const navigate = useNavigate();
  const scope = useImScope();
  const paths = scopePaths(scope);
  const [contacts, setContacts] = useState<RealtimeContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const page = await realtimeApi.listContacts({ page: 1, pageSize: 100 });
      setContacts(page.list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <FormalPage action={<Button size="sm" to={paths.friendRequests} variant="secondary">好友申请</Button>} onBack={() => navigate(-1)} title="联系人">
      {error ? <ErrorNotice error={error} retry={() => void load()} /> : null}
      {loading ? <EmptyState>正在读取正式联系人...</EmptyState> : null}
      {!loading && contacts.length === 0 ? <EmptyState>还没有联系人</EmptyState> : null}
      <section className="overflow-hidden rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)]">{contacts.map((contact) => <Link className="flex items-center justify-between border-b border-[color:var(--client-line)] px-4 py-4 last:border-b-0" key={contact.id} to={`${paths.contacts}/${contact.id}`}><span><strong className="block text-sm font-black">{contact.nickname || `用户 #${contact.contactUserId}`}</strong><span className="mt-1 block text-xs font-bold text-[color:var(--client-muted)]">来源：{contact.source}</span></span><span className="text-sm font-black">›</span></Link>)}</section>
      <Button className="w-full" to={paths.newConversation}>创建会话</Button>
    </FormalPage>
  );
}

export function FormalImFriendRequestsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [requests, setRequests] = useState<RealtimeFriendRequest[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(() => realtimeApi.listFriendRequests({ direction: "incoming", page: 1, pageSize: 100 }).then((page) => setRequests(page.list)).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError))), []);
  useEffect(() => { void load(); }, [load]);

  const respond = async (request: RealtimeFriendRequest, action: "accept" | "reject") => {
    try {
      if (action === "accept") await realtimeApi.acceptFriendRequest(request.id);
      else await realtimeApi.rejectFriendRequest(request.id);
      await load();
    } catch (responseError) {
      setError(responseError instanceof Error ? responseError.message : String(responseError));
    }
  };

  return <FormalPage onBack={() => navigate(-1)} title="好友申请">{error ? <ErrorNotice error={error} retry={() => void load()} /> : null}{requests.length === 0 ? <EmptyState>没有待处理好友申请</EmptyState> : null}<section className="space-y-3">{requests.map((request) => <article className="rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4" key={request.id}><strong className="text-sm font-black">用户 #{request.requesterUserId}</strong><p className="mt-2 text-sm font-bold text-[color:var(--client-muted)]">{request.message || "请求添加您为好友"}</p><div className="mt-3 flex gap-2">{request.status === "pending" && request.targetUserId === session?.id ? <><Button onClick={() => void respond(request, "accept")} size="sm">接受</Button><Button onClick={() => void respond(request, "reject")} size="sm" variant="secondary">拒绝</Button></> : <Badge tone="neutral">{request.status}</Badge>}</div></article>)}</section></FormalPage>;
}

export function FormalImNewConversationPage() {
  const navigate = useNavigate();
  const scope = useImScope();
  const [targetUserId, setTargetUserId] = useState("");
  const [friendMessage, setFriendMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const target = Number(targetUserId);
    if (!Number.isInteger(target) || target <= 0) return setError("请输入有效的用户 ID");
    setBusy(true);
    setError("");
    try {
      const conversation = await realtimeApi.createConversation({ participantUserIds: [target], type: "direct" });
      navigate(`${scopePaths(scope).messages}/${conversation.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(false);
    }
  };
  const requestFriend = async () => {
    const target = Number(targetUserId);
    if (!Number.isInteger(target) || target <= 0) return setError("请输入有效的用户 ID");
    setBusy(true);
    setError("");
    try {
      await realtimeApi.createFriendRequest({ targetUserId: target, ...(friendMessage.trim() ? { message: friendMessage.trim() } : {}) });
      setFriendMessage("");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setBusy(false);
    }
  };
  return <FormalPage onBack={() => navigate(-1)} title="新会话">{error ? <ErrorNotice error={error} retry={() => setError("")} /> : null}<section className="space-y-4 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5"><label><span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">对方正式用户 ID</span><input className={inputClassName} inputMode="numeric" onChange={(event) => setTargetUserId(event.target.value)} value={targetUserId} /></label><label><span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">好友申请留言（可选）</span><input className={inputClassName} maxLength={300} onChange={(event) => setFriendMessage(event.target.value)} value={friendMessage} /></label><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void create()}>创建会话</Button><Button disabled={busy} onClick={() => void requestFriend()} variant="secondary">发送好友申请</Button></div></section></FormalPage>;
}

export function FormalImConversationInfoPage() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const [conversation, setConversation] = useState<RealtimeConversation | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const page = await realtimeApi.listConversations({ page: 1, pageSize: 100 });
      setConversation(page.list.find((item) => item.id === Number(conversationId)) ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    }
  }, [conversationId]);
  useEffect(() => { void load(); }, [load]);
  return <FormalPage onBack={() => navigate(-1)} title="会话详情">{error ? <ErrorNotice error={error} retry={() => void load()} /> : null}{!error && !conversation ? <EmptyState>没有找到当前会话</EmptyState> : null}{conversation ? <section className="space-y-3 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5"><p className="text-sm font-black">类型：{conversation.type === "group" ? "群聊" : "单聊"}</p><p className="text-sm font-black">成员</p>{conversation.participants.map((participant) => <div className="rounded-[16px] bg-[color:var(--client-bg)] px-4 py-3 text-sm font-bold" key={participant.userId}>{participant.username} · ID {participant.userId}</div>)}</section> : null}</FormalPage>;
}

export function FormalImContactDetailPage() {
  const navigate = useNavigate();
  const { contactId } = useParams();
  const [contact, setContact] = useState<RealtimeContact | null>(null);
  useEffect(() => { realtimeApi.listContacts({ page: 1, pageSize: 100 }).then((page) => setContact(page.list.find((item) => item.id === Number(contactId)) ?? null)).catch(() => setContact(null)); }, [contactId]);
  return <FormalPage onBack={() => navigate(-1)} title="联系人详情">{contact ? <section className="space-y-3 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5"><p className="text-lg font-black">{contact.nickname || `用户 #${contact.contactUserId}`}</p><p className="text-sm font-bold text-[color:var(--client-muted)]">正式用户 ID：{contact.contactUserId}</p><p className="text-sm font-bold text-[color:var(--client-muted)]">来源：{contact.source}</p><p className="text-sm font-bold text-[color:var(--client-muted)]">建立时间：{formatDateTime(contact.createdAt)}</p></section> : <EmptyState>没有找到联系人</EmptyState>}</FormalPage>;
}

export function FormalImSearchPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [conversations, setConversations] = useState<RealtimeConversation[]>([]);
  useEffect(() => { realtimeApi.listConversations({ page: 1, pageSize: 100 }).then((page) => setConversations(page.list)).catch(() => setConversations([])); }, []);
  const filtered = useMemo(() => conversations.filter((conversation) => `${getConversationTitle(conversation, session?.id)} ${conversation.lastMessage?.content ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [conversations, query, session?.id]);
  return <FormalPage onBack={() => navigate(-1)} title="搜索消息"><input className={inputClassName} onChange={(event) => setSearchParams(event.target.value ? { q: event.target.value } : {})} placeholder="搜索会话或最近消息" value={query} />{query && filtered.length === 0 ? <EmptyState>没有匹配结果</EmptyState> : null}{filtered.length > 0 ? <ConversationListContent conversations={filtered} /> : null}</FormalPage>;
}

export function FormalImCapabilityPage({ title = "该通讯功能" }: { title?: string }) {
  const navigate = useNavigate();
  return <FormalPage onBack={() => navigate(-1)} title={title}><section className="rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-6"><Badge tone="yellow">尚未启用</Badge><h2 className="mt-4 text-xl font-black">正式合同尚未完成</h2><p className="mt-3 text-sm font-bold leading-7 text-[color:var(--client-muted)]">当前不会展示或修改模拟数据。组织通讯录、黑名单、标签、服务号、媒体文件和群高级设置需要独立数据表、对象存储、RBAC 与审计后才会开放。</p></section></FormalPage>;
}
