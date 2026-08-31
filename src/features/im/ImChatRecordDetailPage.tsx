import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";
import type {
  ImChatRecordItem,
  ImChatRecordItemPage,
  ImChatRecordMedia,
  ImChatRecordSummary,
} from "./chat-records";
import { deriveImChatRecordTitleKind, formatLocalizedImChatRecordTitle } from "./chat-records";
import { MessageBubble } from "./components";
import { restoreImChatRecordFocus } from "./chat-record-focus";
import type { ConversationMessage, ImMessageType, ImRoleType } from "./model";
import { getImRoleConfig } from "./role-config";

export type ImChatRecordReadApi = {
  getChatRecord(publicId: string): Promise<ImChatRecordSummary>;
  listChatRecordItems(
    publicId: string,
    query?: { beforePosition?: number; pageSize?: number },
  ): Promise<ImChatRecordItemPage>;
  getChatRecordMedia(publicId: string, checksumSha256: string): Promise<ImChatRecordMedia>;
};

type RouteState = {
  imChatRecordFallbackPath?: string;
  imChatRecordOpenerId?: string;
};

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const checksumPattern = /^[0-9a-f]{64}$/u;

function mergeSnapshotItems(older: ImChatRecordItem[], current: ImChatRecordItem[]) {
  const ids = new Set<string>();
  const positions = new Set<number>();
  return [...older, ...current]
    .sort((left, right) => left.position - right.position)
    .filter((item) => {
      if (ids.has(item.id) || positions.has(item.position)) return false;
      ids.add(item.id);
      positions.add(item.position);
      return true;
    });
}

function snapshotMedia(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const media = (value as { media?: unknown }).media;
  if (!media || typeof media !== "object" || Array.isArray(media)) return null;
  const { checksumSha256, mimeType, size } = media as Record<string, unknown>;
  if (
    typeof checksumSha256 !== "string" ||
    !checksumPattern.test(checksumSha256) ||
    typeof mimeType !== "string" ||
    !/^(?:image|audio)\/[a-z0-9.+-]+$/iu.test(mimeType) ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) return null;
  return { checksumSha256, mimeType, size };
}

function mediaMatchesSnapshot(media: ImChatRecordMedia, snapshot: NonNullable<ReturnType<typeof snapshotMedia>>) {
  const contentType = media.contentType.split(";", 1)[0]?.trim().toLowerCase();
  const blobType = media.blob.type.split(";", 1)[0]?.trim().toLowerCase();
  const etag = media.etag?.trim().replace(/^W\//u, "").replace(/^"|"$/gu, "").toLowerCase();
  return contentType === snapshot.mimeType.toLowerCase()
    && blobType === snapshot.mimeType.toLowerCase()
    && media.contentLength === snapshot.size
    && media.blob.size === snapshot.size
    && etag === snapshot.checksumSha256.toLowerCase();
}

function toSnapshotMessage(item: ImChatRecordItem, language: Language, mediaUrl?: string): ConversationMessage {
  const metadata = snapshotMedia(item.metadata);
  const type: ImMessageType = metadata?.mimeType.startsWith("image/")
    ? "image"
    : metadata?.mimeType.startsWith("audio/")
      ? "voice"
      : item.messageType === "emoji"
        ? "emoji"
        : "text";
  return {
    id: item.id,
    localId: `chat-record-${item.id}`,
    conversationId: "immutable-chat-record",
    senderId: `snapshot-${item.position}`,
    type,
    content: mediaUrl ?? item.content ?? "",
    status: "sent",
    sentAt: item.sentAt,
    clientSeq: item.position,
    ext: mediaUrl ? { url: mediaUrl, fileName: translateText("聊天记录媒体", language) } : undefined,
  };
}

function ProtectedSnapshotMedia({
  api,
  item,
  publicId,
  language,
}: {
  api: ImChatRecordReadApi;
  item: ImChatRecordItem;
  publicId: string;
  language: Language;
}) {
  const metadata = snapshotMedia(item.metadata);
  const [revision, setRevision] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!metadata) return;
    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);
    setUrl(null);
    void api.getChatRecordMedia(publicId, metadata.checksumSha256).then((media) => {
      if (!active) return;
      if (!mediaMatchesSnapshot(media, metadata)) throw new Error("error.im.chat_record_media_mismatch");
      objectUrl = URL.createObjectURL(media.blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, item.id, metadata?.checksumSha256, publicId, revision]);

  if (!metadata) return <p className="px-3 text-xs font-bold text-[color:var(--client-muted)]">{translateText("媒体不可用", language)}</p>;
  if (failed) return (
    <div className="px-3 text-xs font-bold text-[color:var(--client-muted)]">
      <p role="alert">{translateText("媒体读取失败", language)}</p>
      <button className="mt-2 rounded-full border border-[color:var(--client-line)] px-3 py-1.5 text-[color:var(--client-primary)] focus-visible:outline focus-visible:outline-2" onClick={() => setRevision((value) => value + 1)} type="button">
        {translateText("重试", language)}
      </button>
    </div>
  );
  if (!url) return <p className="px-3 text-xs font-bold text-[color:var(--client-muted)]">{translateText("正在读取媒体", language)}</p>;
  return <MessageBubble avatar={item.senderAvatarUrl ?? undefined} isMine={false} message={toSnapshotMessage(item, language, url)} readOnly senderName={item.senderDisplayName} showSender />;
}

function SnapshotTimelineItem({ api, item, publicId, language }: { api: ImChatRecordReadApi; item: ImChatRecordItem; publicId: string; language: Language }) {
  const media = snapshotMedia(item.metadata);
  return (
    <li className="relative pb-5 last:pb-0">
      <span aria-hidden="true" className="absolute -left-[17px] top-4 h-2.5 w-2.5 rounded-full bg-[color:var(--client-primary)] ring-4 ring-[color:var(--client-bg)]" />
      <time className="mb-1 block px-3 text-[10px] font-bold text-[color:var(--client-muted)]" dateTime={item.sentAt}>
        {new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.sentAt))}
      </time>
      {media ? <ProtectedSnapshotMedia api={api} item={item} language={language} publicId={publicId} /> : <MessageBubble avatar={item.senderAvatarUrl ?? undefined} isMine={false} message={toSnapshotMessage(item, language)} readOnly senderName={item.senderDisplayName} showSender />}
    </li>
  );
}

export function ImChatRecordDetailPage({ api, scope = "user", language: requestedLanguage }: { api: ImChatRecordReadApi; scope?: ImRoleType; language?: Language }) {
  const { language: contextLanguage } = useOptionalI18n();
  const language = requestedLanguage ?? contextLanguage;
  const { publicId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as RouteState;
  const [summary, setSummary] = useState<ImChatRecordSummary | null>(null);
  const [items, setItems] = useState<ImChatRecordItem[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const alive = useRef(true);
  const requestGeneration = useRef(0);
  const paginationRequest = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const generation = requestGeneration.current + 1;
    requestGeneration.current = generation;
    paginationRequest.current = null;
    setSummary(null);
    setItems([]);
    setNextCursor(null);
    setLoadingOlder(false);
    if (!publicIdPattern.test(publicId)) {
      setStatus("unavailable");
      return;
    }
    let active = true;
    setStatus("loading");
    void Promise.all([api.getChatRecord(publicId), api.listChatRecordItems(publicId, { pageSize: 20 })]).then(([record, page]) => {
      if (!active || !alive.current || requestGeneration.current !== generation) return;
      setSummary(record);
      setItems([...page.list].sort((left, right) => left.position - right.position));
      setNextCursor(page.nextCursor);
      setStatus("ready");
    }).catch(() => {
      if (active && alive.current && requestGeneration.current === generation) setStatus("unavailable");
    });
    return () => { active = false; };
  }, [api, publicId]);

  const close = useCallback(() => {
    const openerId = state.imChatRecordOpenerId;
    if (openerId) {
      navigate(-1);
      restoreImChatRecordFocus(openerId);
      return;
    }
    navigate(state.imChatRecordFallbackPath ?? getImRoleConfig(scope).routes.messages, { replace: true });
    restoreImChatRecordFocus();
  }, [navigate, scope, state.imChatRecordFallbackPath, state.imChatRecordOpenerId]);

  const loadOlder = useCallback(() => {
    if (nextCursor === null || loadingOlder) return;
    const generation = requestGeneration.current;
    const requestKey = `${generation}:${publicId}:${nextCursor}`;
    if (paginationRequest.current === requestKey) return;
    paginationRequest.current = requestKey;
    setLoadingOlder(true);
    void api.listChatRecordItems(publicId, { beforePosition: nextCursor, pageSize: 20 }).then((page) => {
      if (!alive.current || requestGeneration.current !== generation || paginationRequest.current !== requestKey) return;
      setItems((current) => {
        return mergeSnapshotItems(page.list, current);
      });
      setNextCursor(page.nextCursor);
    }).catch(() => {
      // Keep the cursor and button available so a read-only page can retry safely.
    }).finally(() => {
      if (alive.current && requestGeneration.current === generation && paginationRequest.current === requestKey) {
        paginationRequest.current = null;
        setLoadingOlder(false);
      }
    });
  }, [api, loadingOlder, nextCursor, publicId]);

  const title = useMemo(() => summary ? formatLocalizedImChatRecordTitle(summary.senderNames, summary.titleKind ?? deriveImChatRecordTitleKind(summary.senderNames, summary.senderCount), language) : translateText("聊天记录", language), [language, summary]);

  return (
    <MobileFullscreenPage innerClassName="bg-[color:var(--client-bg)]">
      <MobileFullscreenHeader
        closeLabel={translateText("关闭聊天记录", language)}
        info={translateText("此页面展示创建时保存的只读消息快照，不会随原聊天资料变化。", language)}
        infoLabel={translateText("聊天记录说明", language)}
        onClose={close}
        title={title}
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
        {status === "loading" ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">{translateText("正在读取聊天记录", language)}</p> : null}
        {status === "unavailable" ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]" role="status">{translateText("聊天记录不可用", language)}</p> : null}
        {status === "ready" ? (
          <>
            {nextCursor !== null ? <button className="mx-auto mb-4 block rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black text-[color:var(--client-primary)] focus-visible:outline focus-visible:outline-2" disabled={loadingOlder} onClick={loadOlder} type="button">{loadingOlder ? translateText("正在加载", language) : translateText("加载更早", language)}</button> : null}
            <ol className="im-chat-record-timeline ml-5 border-l border-[color:var(--client-line)] pl-4">
              {items.map((item) => <SnapshotTimelineItem api={api} item={item} key={`${publicId}:${item.id}`} language={language} publicId={publicId} />)}
            </ol>
          </>
        ) : null}
      </main>
    </MobileFullscreenPage>
  );
}
