import { useEffect, useState } from "react";
import { platformUserManagementApi } from "./api";
import type { Paginated, UserExperienceEntry } from "./types";

export function UserExperienceHistory({ userId }: { userId: number }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Paginated<UserExperienceEntry> | null }>({ loading: true, error: null, data: null });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    platformUserManagementApi.listExperienceEntries(userId, { page, page_size: 10 }).then((data) => active && setState({ loading: false, error: null, data })).catch(() => active && setState({ loading: false, error: "经验明细读取失败", data: null }));
    return () => { active = false; };
  }, [page, userId]);
  if (state.loading) return <p className="text-sm text-ink/50">正在读取经验明细…</p>;
  if (state.error) return <p className="text-sm font-bold text-coral">{state.error}</p>;
  if (!state.data?.list.length) return <p className="text-sm text-ink/50">暂无经验变动</p>;
  const totalPages = Math.max(1, Math.ceil(state.data.total / state.data.page_size));
  return <div className="space-y-3"><div className="divide-y divide-line rounded-lg border border-line bg-paper">{state.data.list.map((entry) => <div className="flex items-center justify-between gap-4 px-3 py-2 text-xs" key={entry.publicId}><div><p className="font-bold text-ink">{entry.eventType}</p><p className="mt-1 text-ink/45">{new Date(entry.occurredAt).toLocaleString()}</p></div><strong className="text-moss">+{entry.finalExp} EXP</strong></div>)}</div><div className="flex items-center justify-end gap-2 text-xs text-ink/55"><button className="rounded-md border border-line px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">上一页</button><span>{page} / {totalPages}</span><button className="rounded-md border border-line px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} type="button">下一页</button></div></div>;
}
