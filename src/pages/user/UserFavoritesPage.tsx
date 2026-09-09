import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppIcon,
  floatingHeaderControlButtonClassName,
} from "../../components/client-ui/AppScaffold";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ImChatRecordCard } from "../../features/im/ImChatRecordCard";
import {
  SocialPostCompactCard,
  type SocialPostCompactCardData,
} from "../../features/im/SocialPostCompactCard";
import type {
  ImChatRecordFavorite,
  ImChatRecordFavoritePage,
} from "../../features/im/chat-records";
import { useImStoreApi } from "../../features/im/store";
import { translateImUiText as translateText } from "../../features/im/ui-copy";
import {
  entityEngagementApi,
  type EntityFavoriteListItem,
  type EntityTarget,
} from "../../features/entity-engagement/api";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { UnifiedEntityInfoCard } from "../../shared/profile-card/UnifiedEntityInfoCard";
import { UnifiedServiceInfoCard } from "../../shared/service-card";
import { useSocial } from "../../features/social/context";
import { socialPaths } from "../../features/social/paths";
import { postAuthorKey } from "../../features/social/timeline";

export type UserFavoritesApi = {
  listChatRecordFavorites(query?: {
    page?: number;
    pageSize?: number;
  }): Promise<ImChatRecordFavoritePage>;
  removeChatRecordFavorite(favoriteId: string): Promise<{ deleted: true }>;
};

export type UserEntityFavoritesApi = {
  listFavorites(query?: { page?: number; pageSize?: number }): Promise<{
    list: EntityFavoriteListItem[];
    total: number;
    page: number;
    page_size: number;
  }>;
  setFavorite(target: EntityTarget, isFavorited: boolean): Promise<unknown>;
};

export type UserSocialFavorite = SocialPostCompactCardData;

function normalizedSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

function matchesSearch(query: string, values: Array<string | null | undefined>) {
  if (!query) return true;
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}

function FavoritesSection({
  children,
  empty,
  emptyLabel,
  title,
}: {
  children: ReactNode;
  empty: boolean;
  emptyLabel: string;
  title: string;
}) {
  return (
    <section aria-label={title} className="mb-7" data-favorites-section={title}>
      <h2 className="mb-3 text-sm font-black text-[color:var(--client-muted)]">
        {title}
      </h2>
      {empty ? (
        <p className="py-5 text-center text-sm font-bold text-[color:var(--client-muted)]">
          {emptyLabel}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function EntityFavoriteCardView({
  favorite,
}: {
  favorite: EntityFavoriteListItem;
}) {
  const target = {
    targetType: favorite.targetType,
    publicId: favorite.publicId,
  } as EntityTarget;
  if (favorite.card.kind === "service") {
    return (
      <UnifiedServiceInfoCard
        data={{
          id: favorite.publicId,
          coverUrl: favorite.card.imageUrl,
          name: favorite.card.name,
          priceAmount: favorite.card.priceAmount,
          currency: favorite.card.currency,
          durationMinutes: favorite.card.durationMinutes,
          completedOrderCount: favorite.card.usageCount,
          engagementTarget: target as Extract<
            EntityTarget,
            { targetType: "service" | "technician_service" }
          >,
          favoriteCount: favorite.favoriteCount,
          shareCount: favorite.card.shareCount,
          isFavorited: true,
          isBookable: favorite.card.isBookable,
          shopPublicId: favorite.card.shopPublicId,
          shopAddress: favorite.card.shopAddress,
          description: favorite.card.description,
          tags: favorite.card.tags,
        }}
      />
    );
  }

  return (
    <UnifiedEntityInfoCard
      data={
        favorite.card.kind === "shop"
          ? {
              kind: "shop",
              id: favorite.publicId,
              name: favorite.card.name,
              imageUrl: favorite.card.imageUrl,
              description: favorite.card.description,
              address: favorite.card.address,
              languages: [],
              tags: [],
              rating: favorite.card.rating,
              reviewCount: favorite.card.reviewCount,
              completedOrderCount: favorite.card.completedOrderCount,
              favoriteCount: favorite.favoriteCount,
              shareCount: favorite.card.shareCount,
              engagementTarget: target,
              isFavorited: true,
            }
          : {
              kind: "technician",
              id: favorite.publicId,
              name: favorite.card.name,
              imageUrl: favorite.card.imageUrl,
              description: favorite.card.description,
              languages: favorite.card.languages,
              tags: [],
              rating: favorite.card.rating,
              completedOrderCount: favorite.card.completedOrderCount,
              favoriteCount: favorite.favoriteCount,
              shareCount: favorite.card.shareCount,
              engagementTarget: target,
              isFavorited: true,
              specialReviewTags: [],
            }
      }
    />
  );
}

function EntityFavoritesSection({
  api,
  language,
  query,
}: {
  api: UserEntityFavoritesApi;
  language: Language;
  query: string;
}) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Awaited<
    ReturnType<UserEntityFavoritesApi["listFavorites"]>
  > | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    void api
      .listFavorites({ page: 1, pageSize: 100 })
      .then((next) => {
        if (!active) return;
        setResult(next);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [api, revision]);

  const remove = (favorite: EntityFavoriteListItem) => {
    const key = `${favorite.targetType}:${favorite.publicId}`;
    if (removing) return;
    setRemoving(key);
    void api
      .setFavorite(
        {
          targetType: favorite.targetType,
          publicId: favorite.publicId,
        } as EntityTarget,
        false,
      )
      .then(() => setRevision((value) => value + 1))
      .finally(() => setRemoving(null));
  };
  const normalizedQuery = normalizedSearch(query);
  const visibleFavorites = (result?.list ?? []).filter((favorite) =>
    matchesSearch(normalizedQuery, [
      favorite.card.name,
      favorite.card.description,
      favorite.card.kind === "shop" ? favorite.card.address : undefined,
      favorite.card.kind === "technician"
        ? favorite.card.languages.join(" ")
        : undefined,
      favorite.card.kind === "service"
        ? favorite.card.tags.join(" ")
        : undefined,
    ]),
  );
  const groupCopy: Record<
    EntityFavoriteListItem["card"]["kind"],
    string
  > = {
    shop: translateText("店铺", language),
    technician: translateText("技师", language),
    service: translateText("服务", language),
  };
  const emptyGroupCopy: Record<
    EntityFavoriteListItem["card"]["kind"],
    string
  > = {
    shop: translateText("暂无收藏的店铺", language),
    technician: translateText("暂无收藏的技师", language),
    service: translateText("暂无收藏的服务", language),
  };

  return (
    <>
      {status === "loading" ? (
        <p className="py-5 text-center text-sm font-bold text-[color:var(--client-muted)]">
          {translateText("正在读取收藏", language)}
        </p>
      ) : null}
      {status === "error" ? (
        <div className="py-5 text-center">
          <p className="text-sm font-bold text-[color:var(--client-muted)]">
            {translateText("收藏读取失败", language)}
          </p>
          <button
            className="mt-3 rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black"
            onClick={() => setRevision((value) => value + 1)}
            type="button"
          >
            {translateText("重试", language)}
          </button>
        </div>
      ) : null}
      {status === "ready"
        ? (["shop", "technician", "service"] as const).map((kind) => {
            const rows = visibleFavorites.filter(
              (favorite) => favorite.card.kind === kind,
            );
            return (
              <FavoritesSection
                empty={rows.length === 0}
                emptyLabel={emptyGroupCopy[kind]}
                key={kind}
                title={groupCopy[kind]}
              >
                <ul className="space-y-4">
                  {rows.map((favorite) => {
                    const key = `${favorite.targetType}:${favorite.publicId}`;
                    return (
                      <li key={key}>
                        <EntityFavoriteCardView favorite={favorite} />
                        <div className="mt-2 flex justify-end">
                          <button
                            className="rounded-full px-3 py-1.5 text-xs font-black text-[color:var(--client-muted)]"
                            disabled={removing !== null}
                            onClick={() => remove(favorite)}
                            type="button"
                          >
                            {removing === key
                              ? translateText("正在移除", language)
                              : translateText("移除收藏", language)}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </FavoritesSection>
            );
          })
        : null}
    </>
  );
}

export function UserFavoritesPage({
  api,
  entityApi,
  language: requestedLanguage,
  socialFavorites = [],
}: {
  api: UserFavoritesApi;
  entityApi?: UserEntityFavoritesApi;
  language?: Language;
  socialFavorites?: UserSocialFavorite[];
}) {
  const { language: contextLanguage } = useOptionalI18n();
  const language = requestedLanguage ?? contextLanguage;
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loadRevision, setLoadRevision] = useState(0);
  const [result, setResult] = useState<ImChatRecordFavoritePage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeErrorKey, setRemoveErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  const loadGeneration = useRef(0);
  const activePage = useRef(page);
  const inflightRemovals = useRef(new Set<string>());
  const normalizedQuery = normalizedSearch(query);
  const visibleSocialFavorites = socialFavorites.filter((favorite) =>
    matchesSearch(normalizedQuery, [
      favorite.authorName,
      favorite.text,
      favorite.postId,
    ]),
  );
  const visibleChatFavorites = (result?.list ?? []).filter((favorite) =>
    matchesSearch(normalizedQuery, [
      favorite.title,
      favorite.preview,
      favorite.senderNames.join(" "),
    ]),
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
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
    void api
      .listChatRecordFavorites({ page, pageSize: 20 })
      .then((next) => {
        if (
          !active ||
          !alive.current ||
          loadGeneration.current !== generation ||
          activePage.current !== page
        )
          return;
        setResult(next);
        setStatus("ready");
      })
      .catch(() => {
        if (
          active &&
          alive.current &&
          loadGeneration.current === generation &&
          activePage.current === page
        )
          setStatus("error");
      });
    return () => {
      active = false;
    };
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
    void api
      .removeChatRecordFavorite(favorite.id)
      .then(() => {
        if (!alive.current || activePage.current !== originPage) return;
        const newTotal = Math.max(0, originTotal - 1);
        const offset = (originPage - 1) * originPageSize;
        if (originPage > 1 && offset >= newTotal) {
          setPage(originPage - 1);
          return;
        }
        setLoadRevision((value) => value + 1);
      })
      .catch(() => {
        if (alive.current && activePage.current === originPage)
          setRemoveErrorKey(operationKey);
      })
      .finally(() => {
        inflightRemovals.current.delete(operationKey);
        if (alive.current && activePage.current === originPage)
          setRemovingKey((current) =>
            current === operationKey ? null : current,
          );
      });
  };

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
        footer={searchOpen ? (
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
        ) : undefined}
        info={translateText("店铺、技师、服务、动态与聊天记录", language)}
        onBack={() => navigate(-1)}
        onClose={() => navigate("/me", { replace: true })}
        title={translateText("我的收藏", language)}
      />
      <main className="mx-auto w-full max-w-[480px] px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[color:var(--client-text)]">
      {entityApi ? (
        <EntityFavoritesSection
          api={entityApi}
          language={language}
          query={query}
        />
      ) : null}
      <FavoritesSection
        empty={visibleSocialFavorites.length === 0}
        emptyLabel={translateText("暂无收藏的动态", language)}
        title={translateText("动态", language)}
      >
        <ul className="space-y-3">
          {visibleSocialFavorites.map((favorite) => (
            <li key={favorite.postId}>
              <SocialPostCompactCard
                card={favorite}
                language={language}
                to={socialPaths.post("user", favorite.postId)}
              />
            </li>
          ))}
        </ul>
      </FavoritesSection>
      <FavoritesSection
        empty={status === "ready" && visibleChatFavorites.length === 0}
        emptyLabel={translateText("暂无收藏的聊天记录", language)}
        title={translateText("保存的聊天记录", language)}
      >
      {status === "loading" ? (
        <p className="py-10 text-center text-sm font-bold text-[color:var(--client-muted)]">
          {translateText("正在读取收藏", language)}
        </p>
      ) : null}
      {status === "error" ? (
        <div className="py-10 text-center">
          <p className="text-sm font-bold text-[color:var(--client-muted)]">
            {translateText("收藏读取失败", language)}
          </p>
          <button
            className="mt-3 rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black text-[color:var(--client-primary)]"
            onClick={() => setLoadRevision((value) => value + 1)}
            type="button"
          >
            {translateText("重试", language)}
          </button>
        </div>
      ) : null}
      <ul className="space-y-3">
        {visibleChatFavorites.map((favorite) => (
          <li
            className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_70%,transparent)] p-1.5"
            key={favorite.id}
          >
            <ImChatRecordCard
              language={language}
              openerId={`favorite-${favorite.id}`}
              record={favorite}
            />
            <div className="flex items-center justify-end gap-3 px-2 pb-1 pt-2">
              {removeErrorKey === `${page}:${favorite.id}` ? (
                <span
                  className="text-[11px] font-bold text-[color:var(--client-danger,#d84b4b)]"
                  role="alert"
                >
                  {translateText("移除失败", language)}
                </span>
              ) : null}
              <button
                className="rounded-full px-3 py-1.5 text-xs font-black text-[color:var(--client-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--client-primary)]"
                disabled={removingKey !== null}
                onClick={() => remove(favorite)}
                type="button"
              >
                {removingKey === `${page}:${favorite.id}`
                  ? translateText("正在移除", language)
                  : translateText("移除收藏", language)}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {result && result.total > result.page_size ? (
        <nav
          aria-label={translateText("收藏分页", language)}
          className="mt-5 flex items-center justify-center gap-3"
        >
          <button
            className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
            type="button"
          >
            {translateText("上一页", language)}
          </button>
          <span className="text-xs font-bold text-[color:var(--client-muted)]">
            {page}
          </span>
          <button
            className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black disabled:opacity-40"
            disabled={page * result.page_size >= result.total}
            onClick={() => setPage((value) => value + 1)}
            type="button"
          >
            {translateText("下一页", language)}
          </button>
        </nav>
      ) : null}
      </FavoritesSection>
      </main>
    </>
  );
}

export function UserFavoritesRoutePage() {
  const api = useImStoreApi("user");
  const { getActorForScope, profiles, state } = useSocial();
  const actorKey = getActorForScope("user");
  const socialFavorites = useMemo<UserSocialFavorite[]>(() => {
    const interactions = state.interactions[actorKey] ?? {};
    return state.posts
      .filter((post) => interactions[post.id]?.bookmarked)
      .map((post) => {
        const author = profiles[postAuthorKey(post)];
        const media = post.media[0];
        return {
          postId: post.id,
          authorName: author?.displayName ?? author?.handle ?? "NeeDo",
          authorAvatar: author?.avatar ?? "",
          text: post.text,
          ...(media?.url ? { mediaUrl: media.url } : {}),
          ...(media?.type ? { mediaType: media.type } : {}),
          ...(media?.thumbnailUrl
            ? { mediaThumbnailUrl: media.thumbnailUrl }
            : {}),
        };
      });
  }, [actorKey, profiles, state.interactions, state.posts]);
  return (
    <MobileShell showBottomNav={false} showTopEdgeMask={false}>
      <UserFavoritesPage
        api={api}
        entityApi={entityEngagementApi}
        socialFavorites={socialFavorites}
      />
    </MobileShell>
  );
}
