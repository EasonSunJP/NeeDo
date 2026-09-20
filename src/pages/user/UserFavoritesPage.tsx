import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppIcon, floatingHeaderControlButtonClassName } from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { FavoriteTimelineRow } from "../../features/favorites/FavoriteTimelineRow";
import { favoritesApi, type FavoriteInteractionState } from "../../features/favorites/api";
import {
  favoriteTabs,
  groupFavoritesByTokyoDate,
  type FavoriteItemType,
  type FavoriteTab,
  type UnifiedFavoriteItem,
  type UnifiedFavoritePage,
} from "../../features/favorites/model";
import { ImMessageMultiSelectOverlay } from "../../features/im/ImMessageMultiSelectOverlay";
import type { EntityTarget } from "../../features/entity-engagement/api";
import { socialPaths } from "../../features/social/paths";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { translateText } from "../../i18n/translations";
import { EntityShareDestinationSheet } from "../../shared/entity-share/EntityShareDestinationSheet";

type FavoriteLoadStatus = "error" | "loading" | "ready";

export type FavoritesTimelineApi = {
  list(input?: { type?: FavoriteItemType; query?: string; page?: number; pageSize?: number }): Promise<UnifiedFavoritePage>;
  removeSourceFavorite(type: FavoriteItemType, itemKey: string): Promise<{ deleted: true }>;
  setPinned(type: FavoriteItemType, itemKey: string, active: boolean): Promise<FavoriteInteractionState>;
  setReaction(type: FavoriteItemType, itemKey: string, reaction: string | null): Promise<FavoriteInteractionState>;
};

const tabLabels: Record<FavoriteTab, string> = {
  all: "全部",
  shop: "店铺",
  technician: "技师",
  service: "服务",
  social_post: "动态",
  chat_record: "聊天记录",
};

const emptyLabels: Record<FavoriteTab, string> = {
  all: "暂无收藏内容",
  shop: "暂无收藏的店铺",
  technician: "暂无收藏的技师",
  service: "暂无收藏的服务",
  social_post: "暂无收藏的动态",
  chat_record: "暂无收藏的聊天记录",
};

function asEntityTarget(item: UnifiedFavoriteItem): EntityTarget | null {
  if (item.type !== "shop" && item.type !== "technician" && item.type !== "service") return null;
  const separator = item.itemKey.indexOf(":");
  const targetType = separator < 0 ? item.type : item.itemKey.slice(0, separator);
  const publicId = separator < 0 ? item.itemKey : item.itemKey.slice(separator + 1);
  if (!["shop", "technician", "service", "technician_service"].includes(targetType)) return null;
  return { targetType, publicId } as EntityTarget;
}

const tabType = (tab: FavoriteTab) => (tab === "all" ? undefined : tab);

export function UserFavoritesPage({
  api = favoritesApi,
  language: requestedLanguage,
  now = () => new Date(),
}: {
  api?: FavoritesTimelineApi;
  language?: Language;
  now?: () => Date;
}) {
  const { language: contextLanguage } = useOptionalI18n();
  const language = requestedLanguage ?? contextLanguage;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<FavoriteTab>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Record<FavoriteTab, number>>(() =>
    Object.fromEntries(favoriteTabs.map((tab) => [tab, 1])) as Record<FavoriteTab, number>,
  );
  const [result, setResult] = useState<UnifiedFavoritePage | null>(null);
  const [status, setStatus] = useState<FavoriteLoadStatus>("loading");
  const [revision, setRevision] = useState(0);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [multiSelectActive, setMultiSelectActive] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [multiPending, setMultiPending] = useState<"delete" | "forward" | null>(null);
  const [entityShareItem, setEntityShareItem] = useState<UnifiedFavoriteItem | null>(null);
  const requestGeneration = useRef(0);
  const page = pages[activeTab];

  useEffect(() => {
    const generation = ++requestGeneration.current;
    setStatus("loading");
    setNotice(null);
    void api.list({ type: tabType(activeTab), query: query.trim() || undefined, page, pageSize: 20 })
      .then((next) => {
        if (generation !== requestGeneration.current) return;
        setResult(next);
        setStatus("ready");
      })
      .catch(() => {
        if (generation === requestGeneration.current) setStatus("error");
      });
  }, [activeTab, api, page, query, revision]);

  useEffect(() => {
    setPages((current) => ({ ...current, [activeTab]: 1 }));
  }, [activeTab, query]);

  useEffect(() => {
    setMultiSelectActive(false);
    setSelectedKeys(new Set());
  }, [activeTab]);

  const rows = result?.list ?? [];
  const groups = useMemo(() => groupFavoritesByTokyoDate(rows, now(), language), [language, now, rows]);
  const selectedRows = rows.filter((item) => selectedKeys.has(item.key));

  const mutate = async (item: UnifiedFavoriteItem, operation: () => Promise<unknown>) => {
    if (busyKeys.has(item.key)) return;
    setBusyKeys((current) => new Set(current).add(item.key));
    setNotice(null);
    try {
      await operation();
      setRevision((value) => value + 1);
    } catch {
      setNotice(translateText("收藏操作失败，请重试", language));
    } finally {
      setBusyKeys((current) => {
        const next = new Set(current);
        next.delete(item.key);
        return next;
      });
    }
  };

  const forward = (item: UnifiedFavoriteItem) => {
    if (!item.canForward) {
      setNotice(translateText("此收藏暂不支持转发", language));
      return;
    }
    const entityTarget = asEntityTarget(item);
    if (entityTarget) {
      setEntityShareItem(item);
    } else if (item.type === "social_post") {
      navigate(socialPaths.repost("user", item.itemKey));
    } else {
      navigate(`${item.detailPath}?action=forward`);
    }
  };

  const confirmMultiDelete = async () => {
    if (multiPending || selectedRows.length === 0) return;
    setMultiPending("delete");
    setDeleteConfirmationOpen(false);
    const outcomes = await Promise.allSettled(
      selectedRows.map((item) => api.removeSourceFavorite(item.type, item.itemKey)),
    );
    const failedKeys = new Set(
      selectedRows.filter((_, index) => outcomes[index]?.status === "rejected").map((item) => item.key),
    );
    if (failedKeys.size > 0) {
      setNotice(translateText("{count}项删除失败，请重试", language).replace("{count}", String(failedKeys.size)));
      setSelectedKeys(failedKeys);
    } else {
      setMultiSelectActive(false);
      setSelectedKeys(new Set());
    }
    setMultiPending(null);
    setRevision((value) => value + 1);
  };

  const multiForward = () => {
    if (selectedRows.length !== 1 || !selectedRows[0]?.canForward) {
      setNotice(translateText("请选择一项可转发的收藏", language));
      return;
    }
    setMultiSelectActive(false);
    setSelectedKeys(new Set());
    forward(selectedRows[0]);
  };

  const tabs = (
    <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1" role="tablist">
      {favoriteTabs.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className={activeTab === tab
            ? "focus-ring shrink-0 rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-[color:var(--client-primary-contrast)]"
            : "focus-ring shrink-0 rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black text-[color:var(--client-muted)]"}
          key={tab}
          onClick={() => setActiveTab(tab)}
          role="tab"
          type="button"
        >
          {translateText(tabLabels[tab], language)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <MobileFullscreenHeader
        action={(
          <button
            aria-label={translateText("搜索收藏", language)}
            className={floatingHeaderControlButtonClassName}
            onClick={() => {
              if (searchOpen) setQuery("");
              setSearchOpen((value) => !value);
            }}
            type="button"
          >
            <AppIcon className="h-5 w-5" name="search" />
          </button>
        )}
        backLabel={translateText("返回个人中心", language)}
        closeLabel={translateText("关闭收藏", language)}
        footer={(
          <div className="space-y-2">
            {searchOpen ? (
              <label className="flex h-10 items-center gap-2 rounded-full border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-3">
                <AppIcon className="h-4 w-4 text-[color:var(--client-muted)]" name="search" />
                <input
                  aria-label={translateText("搜索收藏内容", language)}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-[color:var(--client-muted)]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={translateText("搜索收藏内容", language)}
                  type="search"
                  value={query}
                />
              </label>
            ) : null}
            {tabs}
          </div>
        )}
        info={translateText("店铺、技师、服务、动态与聊天记录", language)}
        onBack={() => navigate(-1)}
        onClose={() => navigate("/me", { replace: true })}
        title={translateText("我的收藏", language)}
      />

      <main className="client-app-frame client-app-gutter overflow-x-hidden pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[color:var(--client-text)]">
        {notice ? <p className="mb-3 rounded-2xl bg-[color:color-mix(in_srgb,var(--client-danger,#f87171)_14%,transparent)] px-4 py-3 text-sm font-black" role="alert">{notice}</p> : null}
        {status === "loading" ? <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">{translateText("正在读取收藏", language)}</p> : null}
        {status === "error" ? (
          <div className="py-10 text-center">
            <p className="text-sm font-bold text-[color:var(--client-muted)]">{translateText("收藏读取失败", language)}</p>
            <button className="mt-3 rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black" onClick={() => setRevision((value) => value + 1)} type="button">{translateText("重试", language)}</button>
          </div>
        ) : null}
        {status === "ready" && rows.length === 0 ? <p className="py-14 text-center text-sm font-bold text-[color:var(--client-muted)]">{translateText(emptyLabels[activeTab], language)}</p> : null}
        {status === "ready" ? groups.map((group) => (
          <section aria-labelledby={`favorite-date-${group.key}`} className="mb-6" key={group.key}>
            <h2 className="mb-2 px-1 text-[17px] font-black" id={`favorite-date-${group.key}`}>{group.label}</h2>
            <div className="overflow-hidden rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-bg)]">
              {group.items.map((item) => (
                <FavoriteTimelineRow
                  busy={busyKeys.has(item.key)}
                  item={item}
                  key={item.key}
                  language={language}
                  multiSelectActive={multiSelectActive}
                  onDelete={() => void mutate(item, () => api.removeSourceFavorite(item.type, item.itemKey))}
                  onForward={() => forward(item)}
                  onMultiSelect={() => { setMultiSelectActive(true); setSelectedKeys(new Set([item.key])); }}
                  onPin={() => void mutate(item, () => api.setPinned(item.type, item.itemKey, !item.pinnedAt))}
                  onReact={(reaction) => void mutate(item, () => api.setReaction(item.type, item.itemKey, reaction))}
                  onToggleSelected={() => setSelectedKeys((current) => {
                    const next = new Set(current);
                    next.has(item.key) ? next.delete(item.key) : next.add(item.key);
                    return next;
                  })}
                  selected={selectedKeys.has(item.key)}
                />
              ))}
            </div>
          </section>
        )) : null}
        {status === "ready" && result && result.total > result.page_size ? (
          <nav aria-label={translateText("收藏分页", language)} className="flex items-center justify-center gap-3 py-3">
            <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40" disabled={page <= 1} onClick={() => setPages((current) => ({ ...current, [activeTab]: page - 1 }))} type="button">{translateText("上一页", language)}</button>
            <span className="text-xs font-bold text-[color:var(--client-muted)]">{page}</span>
            <button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40" disabled={page * result.page_size >= result.total} onClick={() => setPages((current) => ({ ...current, [activeTab]: page + 1 }))} type="button">{translateText("下一页", language)}</button>
          </nav>
        ) : null}
      </main>

      {multiSelectActive ? (
        <ImMessageMultiSelectOverlay
          actionItems={[
            { icon: "forward", key: "forward", label: "转发", onClick: multiForward },
            { icon: "delete", key: "delete", label: "删除", onClick: () => setDeleteConfirmationOpen(true) },
          ]}
          deleteConfirmationOpen={deleteConfirmationOpen}
          deleteConfirmationText={translateText("确定删除所选收藏吗？", language)}
          language={language}
          notice={notice}
          onCancel={() => { setMultiSelectActive(false); setSelectedKeys(new Set()); }}
          onConfirmDelete={() => void confirmMultiDelete()}
          onCopy={() => undefined}
          onDelete={() => setDeleteConfirmationOpen(true)}
          onDismissDeleteConfirmation={() => setDeleteConfirmationOpen(false)}
          onFavorite={() => undefined}
          onForward={multiForward}
          onSelectToPoint={() => undefined}
          pendingAction={multiPending}
          recordActionsSupported={selectedRows.every((item) => item.canForward)}
          selectedCount={selectedKeys.size}
          selectedCountText={translateText("已选择 {count} 项", language).replace("{count}", String(selectedKeys.size))}
          showRangeControls={false}
        />
      ) : null}
      {entityShareItem && asEntityTarget(entityShareItem) ? (
        <EntityShareDestinationSheet onClose={() => setEntityShareItem(null)} target={asEntityTarget(entityShareItem)!} targetLabel={entityShareItem.title} />
      ) : null}
    </>
  );
}

export function UserFavoritesRoutePage() {
  return <MobileShell showBottomNav={false} showTopEdgeMask={false}><UserFavoritesPage /></MobileShell>;
}
