import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  backofficeRealDataApi,
  type BackofficeOrderPayload
} from "../../api/backofficeRealData";
import { ApiClientError } from "../../api/httpClient";
import type { AuthSession } from "../../auth/rbac";
import { AvatarImage } from "../ui/AvatarImage";
import { ekycApplicationsApi, type EkycApplicationSummary } from "../../features/settings/ekycApplicationsApi";
import type { Language } from "../../i18n/translations";
import { translateText } from "../../i18n/translations";
import {
  resolveAdminDisplayName,
  resolveAdminRoleLabel
} from "./adminOperatorSummaryModel";

type QueueState<T> = {
  error: "forbidden" | "load" | null;
  items: T[];
  status: "idle" | "loading" | "success" | "error";
  total: number | null;
};

type Props = {
  hasPermission: (permission: string) => boolean;
  language: Language;
  session: AuthSession | null;
};

const initialQueueState = <T,>(): QueueState<T> => ({
  error: null,
  items: [],
  status: "idle",
  total: null
});

function queueError(error: unknown): QueueState<never>["error"] {
  return error instanceof ApiClientError && error.status === 403 ? "forbidden" : "load";
}

function isPlatformAdminSession(session: AuthSession | null) {
  return Boolean(
    session?.portal === "admin" &&
      (session.currentIdentity.type === "platform" ||
        session.currentIdentity.type === "platform_admin")
  );
}

function formatTimestamp(value: string, language: Language) {
  const locales: Record<Language, string> = {
    zh: "zh-CN",
    "zh-Hant": "zh-TW",
    ja: "ja-JP",
    en: "en-US",
    ko: "ko-KR"
  };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locales[language], {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
}

function QueueMessage({
  empty,
  language,
  onRetry,
  state
}: {
  empty: string;
  language: Language;
  onRetry: () => void;
  state: QueueState<unknown>;
}) {
  const t = (source: string) => translateText(source, language);
  if (state.status === "loading" || state.status === "idle") {
    return <p className="px-2 py-3 text-center text-[11px] font-bold text-ink/45">{t("正在加载…")}</p>;
  }
  if (state.status === "error") {
    return (
      <div className="px-2 py-3 text-center text-[11px] font-bold text-coral" role="alert">
        <p>{t(state.error === "forbidden" ? "权限已变化，请刷新页面" : "加载失败，请重试")}</p>
        {state.error === "load" ? (
          <button className="focus-ring mt-2 rounded-md border border-current px-2 py-1" onClick={onRetry} type="button">
            {t("重试")}
          </button>
        ) : null}
      </div>
    );
  }
  if (state.items.length === 0) {
    return <p className="px-2 py-3 text-center text-[11px] font-bold text-ink/45">{t(empty)}</p>;
  }
  return null;
}

export function AdminOperatorSummary({ hasPermission, language, session }: Props) {
  const [expanded, setExpanded] = useState<"orders" | null>(null);
  const [orderRevision, setOrderRevision] = useState(0);
  const [reviewRevision, setReviewRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setReviewRevision(value => value + 1);
    window.addEventListener("ekyc-review-updated", refresh);
    return () => window.removeEventListener("ekyc-review-updated", refresh);
  }, []);
  const [orders, setOrders] = useState<QueueState<BackofficeOrderPayload>>(initialQueueState);
  const [reviews, setReviews] = useState<QueueState<EkycApplicationSummary>>(initialQueueState);
  const canReadOrders = hasPermission("backoffice:orders:list");
  const canReadReviews = hasPermission("ops:ekyc-application:read");
  const sessionKey = `${session?.id ?? "anonymous"}:${session?.activeIdentityId ?? "none"}`;


  useEffect(() => {
    if (!canReadOrders || !isPlatformAdminSession(session)) {
      setOrders(initialQueueState());
      return;
    }
    let current = true;
    setOrders({ ...initialQueueState(), status: "loading" });
    backofficeRealDataApi
      .orders("backoffice", { page: 1, pageSize: 5, status: "pending" })
      .then((result) => {
        if (!current) return;
        setOrders({ error: null, items: result.list, status: "success", total: result.total });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setOrders({ error: queueError(error), items: [], status: "error", total: null });
      });
    return () => {
      current = false;
    };
  }, [canReadOrders, orderRevision, sessionKey]);

  useEffect(() => {
    if (!canReadReviews || !isPlatformAdminSession(session)) {
      setReviews(initialQueueState());
      return;
    }
    let current = true;
    setReviews({ ...initialQueueState(), status: "loading" });
    ekycApplicationsApi.listReviews(1, "submitted")
      .then((result) => {
        if (!current) return;
        setReviews({ error: null, items: result.list, status: "success", total: result.total });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setReviews({ error: queueError(error), items: [], status: "error", total: null });
      });
    return () => {
      current = false;
    };
  }, [canReadReviews, reviewRevision, sessionKey]);

  if (!session || !isPlatformAdminSession(session)) return null;

  const t = (source: string) => translateText(source, language);
  const name = resolveAdminDisplayName(session);
  const roleLabel = resolveAdminRoleLabel(session, t("运营后台成员"));

  const toggle = (queue: "orders") => {
    setExpanded((current) => (current === queue ? null : queue));
  };

  return (
    <section className="admin-profile mt-4 shrink-0 rounded-lg border border-line bg-paper p-3">
      <div className="flex items-center gap-3">
        <AvatarImage alt={name} className="h-11 w-11 object-cover" src={session.avatarUrl ?? undefined} />
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{name}</p>
          <p className="mt-1 truncate text-xs text-ink/45">{roleLabel}</p>
        </div>
      </div>

      {canReadOrders || canReadReviews ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {canReadOrders ? (
            <button
              aria-controls="admin-pending-orders"
              aria-expanded={expanded === "orders"}
              className="focus-ring rounded-md bg-white px-2 py-2 text-left transition hover:bg-mint/10"
              onClick={() => toggle("orders")}
              type="button"
            >
              <span className="block text-[11px] text-ink/45">{t("待处理")}</span>
              <strong className="text-sm">{orders.total ?? "—"}</strong>
            </button>
          ) : null}
          {canReadReviews ? (
            <Link to="/admin/application-reviews/ekyc" className="focus-ring rounded-md bg-white px-2 py-2 text-left transition hover:bg-mint/10">
              <span className="block text-[11px] text-ink/45">{t("审核")}</span>
              <strong className="text-sm">{reviews.total ?? "—"}</strong>
            </Link>
          ) : null}
        </div>
      ) : null}

      {expanded === "orders" && canReadOrders ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-line bg-white p-1" id="admin-pending-orders">
          <QueueMessage empty="暂无待处理订单" language={language} onRetry={() => setOrderRevision((value) => value + 1)} state={orders} />
          {orders.status === "success" ? orders.items.map((order) => (
            <Link className="focus-ring block rounded-md px-2 py-2 text-xs hover:bg-paper" key={order.id} to={`/admin/orders?status=pending&orderId=${order.id}`}>
              <span className="flex items-center justify-between gap-2 font-black"><span className="truncate">{order.orderNo}</span><span className="shrink-0 text-[10px] text-ink/40">{t("待确认")}</span></span>
              <span className="mt-1 block truncate text-[10px] text-ink/45">{order.shopName} · {formatTimestamp(order.createdAt, language)}</span>
            </Link>
          )) : null}
          {orders.status === "success" ? <Link className="focus-ring mt-1 block rounded-md px-2 py-2 text-center text-[11px] font-black text-moss hover:bg-paper" to="/admin/orders?status=pending">{t("查看全部")}</Link> : null}
        </div>
      ) : null}


    </section>
  );
}
