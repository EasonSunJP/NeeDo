import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold, PrimaryButton, SecondaryButton, SurfacePanel } from "../../../components/client-ui/AppScaffold";
import { useOptionalI18n } from "../../../i18n/I18nProvider";
import type { Language } from "../../../i18n/translations";
import { useSocial } from "../context";
import { loadFormalSocialMentionCandidates } from "../formal-contacts";
import { getSocialScopeFromPathname, socialPaths } from "../paths";
import type { SocialMentionCandidate } from "../types";
import { navItemsForSocialScope, SocialEmptyState, SocialPostItem, SocialTopActions } from "../components/SocialUi";

type RepostCopy = {
  backToDetail: string;
  description: string;
  emptyContacts: string;
  loadError: string;
  loading: string;
  missingDescription: string;
  missingSubtitle: string;
  missingTitle: string;
  originalPost: string;
  returnTimeline: string;
  searchPlaceholder: string;
  selectFriends: string;
  selectHint: string;
  sendError: string;
  sending: string;
  sendSuccess: string;
  sendToFriends: string;
  subtitle: string;
  title: string;
  transferInfo: string;
};

const repostCopy: Record<Language, RepostCopy> = {
  zh: { backToDetail: "回到帖子详情", description: "只有双方仍为好友且未拉黑时才能发送。每位好友会收到一张可打开原动态的私信卡片。", emptyContacts: "没有可转发的好友。", loadError: "好友列表加载失败，请返回后重试。", loading: "正在加载好友…", missingDescription: "原动态可能已删除，无法继续转发。", missingSubtitle: "动态不存在", missingTitle: "找不到原动态", originalPost: "原动态", returnTimeline: "返回动态首页", searchPlaceholder: "搜索好友名称或 NeeDo ID", selectFriends: "选择好友", selectHint: "可多选，动态会作为卡片发送到各自的好友会话。", sendError: "发送失败，请确认好友关系后重试。", sending: "正在发送…", sendSuccess: "已发送给所选好友，私信会话中可以查看。", sendToFriends: "发送给好友", subtitle: "通过正式好友关系发送到私信", title: "转发给好友", transferInfo: "转发说明" },
  "zh-Hant": { backToDetail: "回到貼文詳情", description: "只有雙方仍為好友且未封鎖時才能傳送。每位好友會收到一張可開啟原動態的私訊卡片。", emptyContacts: "沒有可轉發的好友。", loadError: "好友列表載入失敗，請返回後重試。", loading: "正在載入好友…", missingDescription: "原動態可能已刪除，無法繼續轉發。", missingSubtitle: "動態不存在", missingTitle: "找不到原動態", originalPost: "原動態", returnTimeline: "返回動態首頁", searchPlaceholder: "搜尋好友名稱或 NeeDo ID", selectFriends: "選擇好友", selectHint: "可多選，動態會以卡片傳送到各自的好友會話。", sendError: "傳送失敗，請確認好友關係後重試。", sending: "正在傳送…", sendSuccess: "已傳送給所選好友，可在私訊會話中查看。", sendToFriends: "傳送給好友", subtitle: "透過正式好友關係傳送到私訊", title: "轉發給好友", transferInfo: "轉發說明" },
  ja: { backToDetail: "投稿の詳細へ戻る", description: "双方が友だちのままで、ブロックしていない場合のみ送信できます。各友だちは元の投稿を開けるDMカードを受け取ります。", emptyContacts: "転送できる友だちがいません。", loadError: "友だち一覧を読み込めませんでした。戻って再試行してください。", loading: "友だちを読み込み中…", missingDescription: "元の投稿が削除された可能性があるため、転送できません。", missingSubtitle: "投稿が見つかりません", missingTitle: "元の投稿が見つかりません", originalPost: "元の投稿", returnTimeline: "投稿一覧へ戻る", searchPlaceholder: "友だちの名前または NeeDo IDを検索", selectFriends: "友だちを選択", selectHint: "複数選択できます。投稿は各友だちとの会話にカードとして送信されます。", sendError: "送信できませんでした。友だち関係を確認して再試行してください。", sending: "送信中…", sendSuccess: "選択した友だちに送信しました。DMで確認できます。", sendToFriends: "友だちに送信", subtitle: "正式な友だち関係を通じてDMへ送信", title: "友だちに転送", transferInfo: "転送について" },
  en: { backToDetail: "Back to post details", description: "You can send only while both people remain friends and neither has blocked the other. Each friend receives a direct-message card that opens the original post.", emptyContacts: "No friends are available for forwarding.", loadError: "Could not load friends. Go back and try again.", loading: "Loading friends…", missingDescription: "The original post may have been deleted and cannot be forwarded.", missingSubtitle: "Post unavailable", missingTitle: "Original post not found", originalPost: "Original post", returnTimeline: "Back to posts", searchPlaceholder: "Search friend name or NeeDo ID", selectFriends: "Select friends", selectHint: "Select multiple friends to send the post as a card in each direct conversation.", sendError: "Send failed. Confirm the friendship and try again.", sending: "Sending…", sendSuccess: "Sent to the selected friends. You can view it in direct messages.", sendToFriends: "Send to friends", subtitle: "Send by direct message through a confirmed friendship", title: "Forward to friends", transferInfo: "About forwarding" },
  ko: { backToDetail: "게시물 상세로 돌아가기", description: "서로 친구 상태이고 차단하지 않은 경우에만 보낼 수 있습니다. 각 친구는 원본 게시물을 열 수 있는 메시지 카드를 받습니다.", emptyContacts: "전달할 수 있는 친구가 없습니다.", loadError: "친구 목록을 불러오지 못했습니다. 돌아가서 다시 시도해 주세요.", loading: "친구를 불러오는 중…", missingDescription: "원본 게시물이 삭제되었을 수 있어 전달할 수 없습니다.", missingSubtitle: "게시물을 찾을 수 없음", missingTitle: "원본 게시물을 찾을 수 없습니다", originalPost: "원본 게시물", returnTimeline: "게시물 목록으로 돌아가기", searchPlaceholder: "친구 이름 또는 NeeDo ID 검색", selectFriends: "친구 선택", selectHint: "여러 명을 선택할 수 있으며 게시물이 각 친구와의 대화에 카드로 전송됩니다.", sendError: "전송하지 못했습니다. 친구 관계를 확인한 후 다시 시도해 주세요.", sending: "전송 중…", sendSuccess: "선택한 친구에게 보냈습니다. 메시지 대화에서 확인할 수 있습니다.", sendToFriends: "친구에게 보내기", subtitle: "확인된 친구 관계를 통해 메시지로 전송", title: "친구에게 전달", transferInfo: "전달 안내" }
};

export function SocialRepostPage() {
  const { postId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const copy = repostCopy[language];
  const scope = getSocialScopeFromPathname(location.pathname);
  const {
    getActorForScope,
    getPostById,
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
        <AppTopBar actions={<SocialTopActions scope={scope} />} subtitle={copy.missingSubtitle} title={copy.title} />
        <SocialEmptyState
          action={<PrimaryButton to={socialPaths.timeline(scope)}>{copy.returnTimeline}</PrimaryButton>}
          description={copy.missingDescription}
          title={copy.missingTitle}
        />
      </PageScaffold>
    );
  }

  return (
    <PageScaffold contentClassName="space-y-6 pb-28" navItems={navItemsForSocialScope(scope)}>
      <AppTopBar
        actions={<SocialTopActions scope={scope} />}
        info={copy.subtitle}
        title={copy.title}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SurfacePanel className="space-y-4 rounded-[30px]">
            <div>
              <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.selectFriends}</h2>
              <p className="mt-1 text-sm text-[color:var(--client-muted)]">{copy.selectHint}</p>
            </div>
            <input
              className="h-11 w-full rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={copy.searchPlaceholder}
              value={query}
            />
            {loadStatus === "loading" ? (
              <p className="text-sm text-[color:var(--client-muted)]">{copy.loading}</p>
            ) : loadStatus === "error" ? (
              <p className="text-sm font-semibold text-red-500">{copy.loadError}</p>
            ) : visibleContacts.length === 0 ? (
              <p className="text-sm text-[color:var(--client-muted)]">{copy.emptyContacts}</p>
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
              {sendStatus === "sending" ? copy.sending : `${copy.sendToFriends}${selectedUserIds.length ? `（${selectedUserIds.length}）` : ""}`}
            </button>
            {sendStatus === "sent" ? <p className="text-sm font-semibold text-[color:var(--client-primary)]">{copy.sendSuccess}</p> : null}
            {sendStatus === "error" ? <p className="text-sm font-semibold text-red-500">{copy.sendError}</p> : null}
          </SurfacePanel>

          <SurfacePanel className="space-y-3 rounded-[30px] p-0">
            <div className="px-5 pt-5">
              <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.originalPost}</h2>
            </div>
            <SocialPostItem actorKey={actorKey} post={post} scope={scope} />
          </SurfacePanel>
        </section>

        <aside className="space-y-4">
          <SurfacePanel className="space-y-3">
            <h2 className="text-lg font-black text-[color:var(--client-text)]">{copy.transferInfo}</h2>
            <p className="text-sm leading-7 text-[color:var(--client-muted)]">
              {copy.description}
            </p>
          </SurfacePanel>
          <SecondaryButton className="justify-center" onClick={() => navigate(socialPaths.post(scope, post.id))}>
            {copy.backToDetail}
          </SecondaryButton>
        </aside>
      </div>
    </PageScaffold>
  );
}
