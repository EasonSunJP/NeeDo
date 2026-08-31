import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ImChatRecordCard } from "../../features/im/ImChatRecordCard";
import type { ImChatRecordFavorite, ImChatRecordFavoritePage } from "../../features/im/chat-records";
import { useImStoreApi } from "../../features/im/store";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText, type Language } from "../../i18n/translations";

export type UserFavoritesApi = {
  listChatRecordFavorites(query?: { page?: number; pageSize?: number }): Promise<ImChatRecordFavoritePage>;
  removeChatRecordFavorite(favoriteId: string): Promise<{ deleted: true }>;
};

export function UserFavoritesPage({ api, language: requestedLanguage }: { api: UserFavoritesApi; language?: Language }) {
  const { language: contextLanguage } = useOptionalI18n();
  const language = requestedLanguage ?? contextLanguage;
  const [page, setPage] = useState(1);
  const [loadRevision, setLoadRevision] = useState(0);
  const [result, setResult] = useState<ImChatRecordFavoritePage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeErrorKey, setRemoveErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  const loadGeneration = useRef(0);
  const activePage = useRef(page);
  const inflightRemovals = useRef(new Set<string>());

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    activePage.current = page;
    let active = true;
    setResult(null);
    setRemoveErrorKey(null);
    setRemovingKey(null);
    setStatus("loading");
    void api.listChatRecordFavorites({ page, pageSize: 20 }).then((next) => {
      if (!active || !alive.current || loadGeneration.current !== generation || activePage.current !== page) return;
      setResult(next);
      setStatus("ready");
    }).catch(() => {
      if (active && alive.current && loadGeneration.current === generation && activePage.current === page) setStatus("error");
    });
    return () => { active = false; };
  }, [api, loadRevision, page]);

  const remove = (favorite: ImChatRecordFavorite) => {
    const originPage = page;
    const originTotal = result?.total ?? 0;
    const originPageSize = result?.page_size ?? 20;
    const operationKey = `${originPage}:${favorite.id}`;
    if (inflightRemovals.current.size > 0) return;
    inflightRemovals.current.add(operationKey);
    setRemovingKey(operationKey);
    setRemoveErrorKey(null);
    void api.removeChatRecordFavorite(favorite.id).then(() => {
      if (!alive.current || activePage.current !== originPage) return;
      const newTotal = Math.max(0, originTotal - 1);
      const offset = (originPage - 1) * originPageSize;
      if (originPage > 1 && offset >= newTotal) {
        setPage(originPage - 1);
        return;
      }
      setLoadRevision((value) => value + 1);
    }).catch(() => {
      if (alive.current && activePage.current === originPage) setRemoveErrorKey(operationKey);
    }).finally(() => {
      inflightRemovals.current.delete(operationKey);
      if (alive.current && activePage.current === originPage) setRemovingKey((current) => current === operationKey ? null : current);
    });
  };

  return (
    <section className="mx-auto w-full max-w-[480px] px-4 pb-28 pt-3 text-[color:var(--client-text)]">
      <header className="mb-4 flex min-h-11 items-center gap-3">
        <Link aria-label={translateText("返回个人中心", language)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[color:var(--client-line)] text-[color:var(--client-primary)] focus-visible:outline focus-visible:outline-2" to="/me">
          <AppIcon className="h-5 w-5" name="back" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] font-black">{translateText("我的收藏", language)}</h1>
          <p className="mt-0.5 text-xs font-bold text-[color:var(--client-muted)]">{translateText("保存的聊天记录", language)}</p>
        </div>
      </header>

      {status === "loading" ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">{translateText("正在读取收藏", language)}</p> : null}
      {status === "error" ? <div className="py-10 text-center"><p className="text-sm font-bold text-[color:var(--client-muted)]">{translateText("收藏读取失败", language)}</p><button className="mt-3 rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black text-[color:var(--client-primary)]" onClick={() => setLoadRevision((value) => value + 1)} type="button">{translateText("重试", language)}</button></div> : null}
      {status === "ready" && result?.list.length === 0 ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">{translateText("暂无收藏的聊天记录", language)}</p> : null}

      <ul className="space-y-3">
        {result?.list.map((favorite) => (
          <li className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] p-1.5" key={favorite.id}>
            <ImChatRecordCard language={language} openerId={`favorite-${favorite.id}`} record={favorite} />
            <div className="flex items-center justify-end gap-3 px-2 pb-1 pt-2">
              {removeErrorKey === `${page}:${favorite.id}` ? <span className="text-[11px] font-bold text-[color:var(--client-danger,#d84b4b)]" role="alert">{translateText("移除失败", language)}</span> : null}
              <button className="rounded-full px-3 py-1.5 text-xs font-black text-[color:var(--client-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--client-primary)]" disabled={removingKey !== null} onClick={() => remove(favorite)} type="button">
                {removingKey === `${page}:${favorite.id}` ? translateText("正在移除", language) : translateText("移除收藏", language)}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {result && result.total > result.page_size ? (
        <nav aria-label={translateText("收藏分页", language)} className="mt-5 flex items-center justify-center gap-3">
          <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} type="button">{translateText("上一页", language)}</button>
          <span className="text-xs font-bold text-[color:var(--client-muted)]">{page}</span>
          <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40" disabled={page * result.page_size >= result.total} onClick={() => setPage((value) => value + 1)} type="button">{translateText("下一页", language)}</button>
        </nav>
      ) : null}
    </section>
  );
}

export function UserFavoritesRoutePage() {
  const api = useImStoreApi("user");
  return <MobileShell><UserFavoritesPage api={api} /></MobileShell>;
}
