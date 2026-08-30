import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SecondaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { useSocial } from "../context";
import { loadFormalSocialMentionCandidates } from "../formal-contacts";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import type { SocialMentionCandidate } from "../types";
import { navItemsForSocialScope, SocialEmptyState, SocialPostItem, SocialTopActions } from "../components/SocialUi";

export function SocialRepostPage() {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const scope = getSocialScopeFromPathname(location.pathname);
  const {
    getActorForScope,
    getPostById,
    getUnreadNotificationCount,
    shareSocialPostToFriends
  } = useSocial();
  const actorKey = getActorForScope(scope);
  const post = postId ? getPostById(postId, actorKey) : undefined;
  const [contacts, setContacts] = useState<SocialMentionCandidate[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    let active = true;
    void loadFormalSocialMentionCandidates()
      .then((items) => {
        if (!active) return;
        setContacts(items);
        setLoadStatus("ready");
      })
      .catch(() => {
        if (active) setLoadStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return contacts.filter(
      (contact) => !normalized || contact.searchText.toLowerCase().includes(normalized)
    );
  }, [contacts, query]);

  const toggleTarget = (targetUserId: number) => {
    setSelectedUserIds((current) =>
      current.includes(targetUserId)
        ? current.filter((userId) => userId !== targetUserId)
        : [...current, targetUserId]
    );
    setSendStatus("idle");
  };

  const sendToFriends = async () => {
    if (!post || selectedUserIds.length === 0 || sendStatus === "sending") return;
    setSendStatus("sending");
    try {
      const targetUserIds = selectedUserIds;
      const deliveredUserIds = await shareSocialPostToFriends(post.id, actorKey, targetUserIds);
      setSelectedUserIds(deliveredUserIds);
      setSendStatus("sent");
    } catch {
      setSendStatus("error");
    }
  };

  if (!post) {
    return (
      <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
        <AppTopBar actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />} subtitle="动态不存在" title="转发动态" />
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>返回动态首页</PrimaryButton>}
          description="原动态可能已删除，无法继续转发。"
          title="找不到原动态"
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} unreadCount={getUnreadNotificationCount(actorKey)} />}
        info="通过正式好友关系发送到私信"
        title="转发给好友"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SurfacePanel className="space-y-4 rounded-[30px]">
            <div>
              <h2 className="text-lg font-black text-[color:var(--client-text)]">选择好友</h2>
              <p className="mt-1 text-sm text-[color:var(--client-muted)]">可多选，动态会作为卡片发送到各自的好友会话。</p>
            </div>
            <input
              className="h-11 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="搜索好友名称或 NeeDo ID"
              value={query}
            />
            {loadStatus === "loading" ? (
              <p className="text-sm text-[color:var(--client-muted)]">正在加载好友…</p>
            ) : loadStatus === "error" ? (
              <p className="text-sm font-semibold text-red-500">好友列表加载失败，请返回后重试。</p>
            ) : visibleContacts.length === 0 ? (
              <p className="text-sm text-[color:var(--client-muted)]">没有可转发的好友。</p>
            ) : (
              <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {visibleContacts.map((contact) => {
                  const selected = selectedUserIds.includes(contact.userId);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`flex min-w-0 items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)] bg-[color:var(--client-surface)]"}`}
                      key={contact.userId}
                      onClick={() => toggleTarget(contact.userId)}
                      type="button"
                    >
                      <img alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" src={contact.avatarUrl} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-[color:var(--client-text)]">{contact.displayName}</strong>
                        <span className="mt-0.5 block truncate text-xs text-[color:var(--client-muted)]">{contact.needoId}</span>
                      </span>
                      <span className="text-lg font-black text-[color:var(--client-primary)]">{selected ? "✓" : "+"}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <button
              className="h-12 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={selectedUserIds.length === 0 || sendStatus === "sending" || loadStatus !== "ready"}
              onClick={() => { void sendToFriends(); }}
              type="button"
            >
              {sendStatus === "sending" ? "正在发送…" : `发送给好友${selectedUserIds.length ? `（${selectedUserIds.length}）` : ""}`}
            </button>
            {sendStatus === "sent" ? <p className="text-sm font-semibold text-[color:var(--client-primary)]">已发送给所选好友，私信会话中可以查看。</p> : null}
            {sendStatus === "error" ? <p className="text-sm font-semibold text-red-500">发送失败，请确认好友关系后重试。</p> : null}
          </SurfacePanel>

          <SurfacePanel className="space-y-3 rounded-[30px] p-0">
            <div className="px-5 pt-5">
              <h2 className="text-lg font-black text-[color:var(--client-text)]">原动态</h2>
            </div>
            <SocialPostItem actorKey={actorKey} post={post} scope={scope} />
          </SurfacePanel>
        </section>

        <aside className="space-y-4">
          <SurfacePanel className="space-y-3">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">转发说明</h2>
            <p className="text-sm leading-7 text-[color:var(--client-muted)]">
              只有双方仍为好友且未拉黑时才能发送。每位好友会收到一张可打开原动态的私信卡片。
            </p>
          </SurfacePanel>
          <SecondaryButton className="justify-center" onClick={() => navigate(socialPaths.post(scope, post.id))}>
            回到帖子详情
          </SecondaryButton>
        </aside>
      </div>
    </PageScaffold>
  );
}
