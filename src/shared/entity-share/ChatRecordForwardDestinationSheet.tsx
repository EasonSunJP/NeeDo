import { useMemo, useRef, useState } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { realtimeApi } from "../../features/realtime/api";
import { useEntityShareDestinations } from "./useEntityShareDestinations";

export function ChatRecordForwardDestinationSheet({ onClose, publicId, title }: { onClose: () => void; publicId: string; title: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const keys = useRef(new Map<string, string>());
  const { destinations, error, loading } = useEntityShareDestinations(query);
  const selectedRows = useMemo(() => destinations.filter((item) => selected.has(item.key)), [destinations, selected]);
  const send = async () => {
    if (sending || selectedRows.length === 0) return;
    setSending(true);
    setErrorMessage("");
    const outcomes = await Promise.allSettled(selectedRows.map(async (destination) => {
      const targetConversationId = destination.kind === "group"
        ? destination.conversationId
        : (await realtimeApi.createConversation({ participantUserIds: [destination.userId], type: "direct" })).id;
      const idempotencyKey = keys.current.get(destination.key) ?? crypto.randomUUID();
      keys.current.set(destination.key, idempotencyKey);
      return realtimeApi.forwardChatRecord(publicId, { targetConversationId, idempotencyKey });
    }));
    setSending(false);
    if (outcomes.some((outcome) => outcome.status === "rejected")) setErrorMessage("部分聊天记录转发失败，请重试。");
    else onClose();
  };
  return <div aria-modal="true" className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-3 sm:items-center" role="dialog">
    <section className="max-h-[88dvh] w-full max-w-lg overflow-hidden rounded-[30px] border border-[#244047] bg-[#031014] text-[#f7f9f7]">
      <header className="flex items-center justify-between border-b border-[#244047] p-4"><div><h2 className="text-lg font-black">转发聊天记录</h2><p className="mt-1 text-xs text-[#9aacb5]">{title}</p></div><button aria-label="关闭" className="grid h-10 w-10 place-items-center rounded-full border border-[#244047]" onClick={onClose} type="button"><AppIcon name="close" /></button></header>
      <div className="p-4"><input aria-label="搜索联系人或群聊" className="h-12 w-full rounded-2xl border border-[#244047] bg-[#07181b] px-4 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="搜索联系人或群聊" value={query} /></div>
      <div className="max-h-[48dvh] space-y-2 overflow-y-auto px-4 pb-4">{loading ? <p className="py-8 text-center text-[#9aacb5]">正在读取…</p> : error ? <p className="py-8 text-center text-red-300">读取失败</p> : destinations.map((destination) => <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-[#244047] bg-[#07181b] px-3 py-2" key={destination.key}><input checked={selected.has(destination.key)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(destination.key) ? next.delete(destination.key) : next.add(destination.key); return next; })} type="checkbox" /><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{destination.label}</strong><span className="block truncate text-xs text-[#9aacb5]">{destination.subtitle}</span></span></label>)}</div>
      {errorMessage ? <p className="px-5 pb-2 text-xs font-bold text-red-300">{errorMessage}</p> : null}
      <footer className="border-t border-[#244047] p-4"><button className="h-12 w-full rounded-full bg-[#b8ff4a] text-sm font-black text-[#031014] disabled:opacity-40" disabled={sending || selectedRows.length === 0} onClick={() => void send()} type="button">{sending ? "转发中…" : `转发（${selectedRows.length}）`}</button></footer>
    </section>
  </div>;
}
