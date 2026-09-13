import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeOrderPayload,
  type BackofficeShopPayload,
  type BackofficeTechnicianPayload
} from "../../api/backofficeRealData";
import { platformUserManagementApi } from "../../features/platform-user-management/api";
import type { PlatformManagedUser } from "../../features/platform-user-management/types";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

type SearchKind = "order" | "user" | "shop" | "technician";

type SearchResult = {
  exactValues: Array<string | null | undefined>;
  href: string;
  id: number;
  kind: SearchKind;
  subtitle: string;
  title: string;
};

type SearchGroup = {
  error: boolean;
  items: SearchResult[];
  kind: SearchKind;
  total: number;
};

const resultLimit = 5;
const permissions: Record<SearchKind, string> = {
  order: "backoffice:orders:list",
  user: "backoffice:users:read",
  shop: "backoffice:shops:list",
  technician: "backoffice:technicians:list"
};

const searchKinds: SearchKind[] = ["order", "user", "shop", "technician"];

function resultHref(kind: SearchKind, id: number, keyword: string) {
  const params = new URLSearchParams({ keyword });
  const routes: Record<SearchKind, { path: string; detailKey: string }> = {
    order: { path: "/admin/orders", detailKey: "orderId" },
    user: { path: "/admin/users", detailKey: "detailUserId" },
    shop: { path: "/admin/merchants", detailKey: "detailShopId" },
    technician: { path: "/admin/technicians", detailKey: "detailTechnicianId" }
  };
  const route = routes[kind];
  params.set(route.detailKey, String(id));
  return `${route.path}?${params.toString()}`;
}

function orderResult(order: BackofficeOrderPayload, keyword: string): SearchResult {
  return {
    exactValues: [order.orderNo],
    href: resultHref("order", order.id, keyword),
    id: order.id,
    kind: "order",
    subtitle: `${order.customerName} · ${order.shopName}`,
    title: order.orderNo
  };
}

function userResult(user: PlatformManagedUser, keyword: string): SearchResult {
  return {
    exactValues: [user.needoId, user.email, user.username, user.displayName],
    href: resultHref("user", user.id, keyword),
    id: user.id,
    kind: "user",
    subtitle: `${user.needoId} · ${user.email}`,
    title: user.displayName
  };
}

function shopResult(shop: BackofficeShopPayload, keyword: string): SearchResult {
  return {
    exactValues: [shop.name, shop.ownerEmail],
    href: resultHref("shop", shop.id, keyword),
    id: shop.id,
    kind: "shop",
    subtitle: `${shop.city} · #${shop.id}`,
    title: shop.name
  };
}

function technicianResult(technician: BackofficeTechnicianPayload, keyword: string): SearchResult {
  return {
    exactValues: [technician.needoId, technician.email, technician.displayName],
    href: resultHref("technician", technician.id, keyword),
    id: technician.id,
    kind: "technician",
    subtitle: `${technician.needoId} · ${technician.shopName ?? technician.city}`,
    title: technician.displayName
  };
}

function isExactResult(result: SearchResult, keyword: string) {
  const normalizedKeyword = keyword.toLocaleLowerCase();
  return result.exactValues.some((value) => value?.trim().toLocaleLowerCase() === normalizedKeyword);
}

export function AdminGlobalSearch({ hasPermission }: {
  hasPermission: (permission: string) => boolean;
}) {
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const [draft, setDraft] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready">("idle");
  const requestRef = useRef(0);

  const labels: Record<SearchKind, string> = {
    order: translateText("订单", language),
    user: translateText("用户", language),
    shop: translateText("店铺", language),
    technician: translateText("技师", language)
  };

  const submit = async () => {
    const keyword = draft.trim().slice(0, 100);
    if (!keyword) {
      requestRef.current += 1;
      setGroups([]);
      setStatus("idle");
      return;
    }

    const requestId = ++requestRef.current;
    setStatus("loading");
    setGroups([]);

    const loaders: Record<SearchKind, () => Promise<SearchGroup>> = {
      order: async () => {
        const page = await backofficeRealDataApi.orders("backoffice", {
          keyword,
          page: 1,
          pageSize: resultLimit
        });
        return { error: false, items: page.list.map((item) => orderResult(item, keyword)), kind: "order", total: page.total };
      },
      user: async () => {
        const page = await platformUserManagementApi.listUsers("operations", {
          keyword,
          page: 1,
          page_size: resultLimit
        });
        return { error: false, items: page.list.map((item) => userResult(item, keyword)), kind: "user", total: page.total };
      },
      shop: async () => {
        const page = await backofficeRealDataApi.shops("backoffice", {
          keyword,
          page: 1,
          pageSize: resultLimit
        });
        return { error: false, items: page.list.map((item) => shopResult(item, keyword)), kind: "shop", total: page.total };
      },
      technician: async () => {
        const page = await backofficeRealDataApi.technicians("backoffice", {
          keyword,
          page: 1,
          pageSize: resultLimit
        });
        return { error: false, items: page.list.map((item) => technicianResult(item, keyword)), kind: "technician", total: page.total };
      }
    };

    const availableKinds = searchKinds.filter((kind) => hasPermission(permissions[kind]));
    const settled = await Promise.all(
      availableKinds.map(async (kind): Promise<SearchGroup> => {
        try {
          return await loaders[kind]();
        } catch {
          return { error: true, items: [], kind, total: 0 };
        }
      })
    );
    if (requestId !== requestRef.current) return;

    const exactMatches = settled.flatMap((group) => group.items).filter((result) => isExactResult(result, keyword));
    if (exactMatches.length === 1) {
      navigate(exactMatches[0].href);
      setStatus("idle");
      setGroups([]);
      return;
    }

    setGroups(settled);
    setStatus("ready");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      requestRef.current += 1;
      setGroups([]);
      setStatus("idle");
    }
  };

  const totalResults = groups.reduce((total, group) => total + group.total, 0);
  const failedGroups = groups.filter((group) => group.error).length;

  return (
    <section className="admin-sidebar-search relative mt-4 rounded-lg border border-line bg-paper p-3">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-ink/40">
        {translateText("全局搜索", language)}
      </p>
      <label className="admin-search flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
        <span className="text-ink/45">⌕</span>
        <input
          aria-label={translateText("全局搜索", language)}
          className="min-w-0 flex-1 bg-transparent outline-none"
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={translateText("搜索订单、用户、门店、技师", language)}
          value={draft}
        />
      </label>

      {status !== "idle" ? (
        <div className="absolute left-0 right-0 top-full z-[80] mt-2 max-h-[55vh] overflow-y-auto rounded-lg border border-line bg-white p-3 shadow-soft">
          {status === "loading" ? (
            <p className="py-3 text-center text-xs font-bold text-ink/50" role="status">
              {translateText("正在搜索账号…", language)}
            </p>
          ) : null}
          {status === "ready" ? (
            <>
              <p className="mb-2 text-xs font-black text-ink">
                {translateText("搜索结果", language)} · {totalResults}
              </p>
              {groups.map((group) => (
                <section className="border-t border-line py-2 first:border-t-0" key={group.kind}>
                  <p className="mb-1 text-[11px] font-black text-ink/45">
                    {labels[group.kind]} · {group.total}
                  </p>
                  {group.error ? (
                    <p className="py-1 text-xs font-bold text-coral">
                      {translateText("搜索失败，请稍后重试", language)}
                    </p>
                  ) : null}
                  {!group.error && group.items.length === 0 ? (
                    <p className="py-1 text-xs font-bold text-ink/40">{translateText("暂无数据", language)}</p>
                  ) : null}
                  {group.items.map((item) => (
                    <button
                      className="focus-ring block w-full rounded-md px-2 py-2 text-left hover:bg-paper"
                      data-global-search-kind={item.kind}
                      key={`${item.kind}-${item.id}`}
                      onClick={() => navigate(item.href)}
                      type="button"
                    >
                      <span className="block truncate text-xs font-black text-ink">{item.title}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-ink/45">{item.subtitle}</span>
                    </button>
                  ))}
                </section>
              ))}
              {failedGroups === groups.length && groups.length > 0 ? (
                <button className="mt-2 w-full rounded-md border border-line px-2 py-2 text-xs font-black" onClick={() => void submit()} type="button">
                  {translateText("重试", language)}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
