import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useOptionalAuth } from "../../auth/AuthProvider";
import { AdminEventTimeline } from "../../components/admin/AdminEventTimeline";
import {
  ContactEventTimelinePanel,
  type ContactEventTimelineEntry,
} from "../../components/mobile/ContactEventTimeline";
import {
  FormalTimelinePagination,
  type FormalTimelinePageSize,
} from "../../components/admin/FormalTimelinePagination";
import type { Language } from "../../i18n/translations";
import {
  workStatusApi,
  workStatusBase,
  type WorkStatusEvent,
  type WorkStatusPage,
  type WorkStatusTarget,
  type WorkStatusQuery,
} from "./api";
import { workText, useWorkText } from "./i18n";
import { incidentDeviation } from "./model";
import { subscribeWorkStatusRefresh } from "./refresh";
export const workStatusAdminTheme = {
  "--client-primary": "var(--admin-accent, #3f6b4e)",
  "--client-primary-strong": "var(--admin-accent-strong, #3f6b4e)",
  "--client-bg": "var(--admin-bg, #f7f7f2)",
  "--client-surface": "var(--admin-surface, #fff)",
  "--client-elevated": "var(--admin-elevated, #eef4ef)",
  "--client-text": "var(--admin-text, #16171a)",
  "--client-muted": "var(--admin-muted, #667085)",
  "--client-line": "var(--admin-line, #e3e1d8)",
} as CSSProperties;
export function workEventEntry(
  event: WorkStatusEvent,
  language: Language,
  target: WorkStatusTarget,
): ContactEventTimelineEntry {
  const t = (
    key: Parameters<typeof workText>[0],
    values?: Record<string, string | number>,
  ) => workText(key, language, values);
  const format = (at: string) =>
    new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : language, {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(at));
  const role =
    event.kind === "late" && event.basis ? t(event.basis) : t(event.kind);
  const orderPath = event.order
    ? target.scope === "technician"
      ? `/technician/orders/${event.order.id}`
      : target.scope === "merchant-admin"
        ? `/merchant/orders/${event.order.id}`
        : `/admin/orders?orderId=${event.order.id}`
    : null;
  return {
    id: event.id,
    atLabel: format(event.at),
    preserveAtLabel: true,
    actorName:
      event.actorName === "System" && !event.actorAvatarUrl
        ? t("system")
        : event.actorName,
    actorAvatarSrc: event.actorAvatarUrl ?? undefined,
    actorRole: role,
    title: role,
    tone:
      event.kind === "late" || event.kind === "early_leave" ? "red" : "green",
    message: (
      <>
        {event.toStatus
          ? t("changed", {
              from: t(event.fromStatus ?? "unsynced"),
              to: t(event.toStatus),
            })
          : null}
        {event.order && orderPath ? (
          <>
            <a
              className="font-bold text-[color:var(--client-primary)] underline underline-offset-2"
              href={`#${orderPath}`}
            >
              {event.order.orderNo}
            </a>{" "}
            · {event.order.customerName} · {event.order.serviceName}{" "}
          </>
        ) : null}
        {event.affectedOrders?.length ? (
          <span className="mt-2 block">
            {t("affectedOrders")}：
            {event.affectedOrders.map((order, index) => (
              <span key={order.id}>
                {index ? " · " : ""}
                <a
                  className="font-bold text-[color:var(--client-primary)] underline underline-offset-2"
                  href={`#${target.scope === "technician" ? `/technician/orders/${order.id}` : target.scope === "merchant-admin" ? `/merchant/orders/${order.id}` : `/admin/orders?orderId=${order.id}`}`}
                >
                  {order.orderNo ?? `#${order.id}`}
                </a>
                {order.serviceName ? ` ${order.serviceName}` : ""}{" "}
                {format(order.startsAt)}
              </span>
            ))}
          </span>
        ) : null}
        {event.plannedAt ? (
          <span className="inline-block">
            {t("planned")} {format(event.plannedAt)} ·
          </span>
        ) : null}
        {event.actualAt ? (
          <span className="inline-block">
            {t("actual")} {format(event.actualAt)} ·
          </span>
        ) : event.kind === "late" ? (
          <span>{t("waiting")}　</span>
        ) : null}
        {event.delaySeconds !== null ? (
          <strong>
            {t("deviation", incidentDeviation(event.delaySeconds))}　
          </strong>
        ) : null}
        {event.reason ? (
          <span className="whitespace-pre-wrap">{event.reason}</span>
        ) : null}
      </>
    ),
  };
}
export function WorkTimeline({
  target,
  query: filter,
  comments = true,
  revision = 0,
  appearance,
}: {
  target: WorkStatusTarget;
  query?: Pick<WorkStatusQuery, "from" | "to" | "kind" | "incidentsOnly">;
  comments?: boolean;
  revision?: number;
  appearance?: "admin" | "client";
}) {
  const { language, t } = useWorkText();
  const usesAdminTimeline = target.scope !== "technician";
  const resolvedAppearance =
    appearance ?? (usesAdminTimeline ? "admin" : "client");
  const auth = useOptionalAuth();
  const [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState<FormalTimelinePageSize>(10),
    [data, setData] = useState<WorkStatusPage | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const [commentOpen, setCommentOpen] = useState(false),
    [draft, setDraft] = useState(""),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(false);
  const commentIntent = useRef<{
    message: string;
    idempotencyKey: string;
  } | null>(null);
  const seq = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  const key = workStatusBase(target),
    filterKey = JSON.stringify(filter ?? {});
  const reload = useCallback(async () => {
    const current = ++seq.current;
    setLoading(true);
    try {
      const result = await workStatusApi.events(targetRef.current, {
        page,
        page_size: pageSize,
        ...JSON.parse(filterKey),
      });
      if (current === seq.current) {
        setData(result);
        setError(false);
      }
    } catch {
      if (current === seq.current) setError(true);
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [key, filterKey, page, pageSize]);
  useEffect(() => {
    setPage(1);
    setData(null);
    setDraft("");
    setCommentOpen(false);
    commentIntent.current = null;
  }, [key, filterKey]);
  useEffect(() => {
    void reload();
    const stop = subscribeWorkStatusRefresh(() => void reload());
    return () => {
      ++seq.current;
      stop();
    };
  }, [reload, revision]);
  const submit = async () => {
    if (!draft.trim() || saving) return;
    const message = draft.trim();
    const intent =
      commentIntent.current?.message === message
        ? commentIntent.current
        : { message, idempotencyKey: crypto.randomUUID() };
    commentIntent.current = intent;
    setSaving(true);
    setSaveError(false);
    try {
      await workStatusApi.comment(target, intent);
      commentIntent.current = null;
      setDraft("");
      setCommentOpen(false);
      setPage(1);
      await reload();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="min-w-0 space-y-3 [&>nav]:!bg-[color:var(--client-surface)] [&>nav_select]:!bg-[color:var(--client-elevated)]"
      style={resolvedAppearance === "admin" ? workStatusAdminTheme : undefined}
    >
      {error ? (
        <p role="alert" className="text-sm text-red-500">
          {t("error")}{" "}
          <button
            className="underline"
            onClick={() => void reload()}
            type="button"
          >
            {t("retry")}
          </button>
        </p>
      ) : null}
      {usesAdminTimeline ? (
        <AdminEventTimeline
          appearance={resolvedAppearance}
          title={t("timeline")}
          events={(data?.list ?? []).map((event) =>
            workEventEntry(event, language, target),
          )}
          emptyLabel={loading ? t("loading") : error ? t("error") : t("empty")}
          commentButtonLabel={t("comment")}
          commentAuthorAvatarSrc={auth?.session?.avatarUrl ?? undefined}
          commentAuthorName={auth?.session?.username}
          showCommentComposer={comments}
          onCommentButtonClick={() => setCommentOpen(true)}
        />
      ) : (
        <ContactEventTimelinePanel
          title={t("timeline")}
          events={(data?.list ?? []).map((event) =>
            workEventEntry(event, language, target),
          )}
          emptyLabel={loading ? t("loading") : error ? t("error") : t("empty")}
          commentButtonLabel={t("comment")}
          commentAuthorAvatarSrc={auth?.session?.avatarUrl ?? undefined}
          commentAuthorName={auth?.session?.username}
          showCommentComposer={comments}
          onCommentButtonClick={() => setCommentOpen(true)}
        />
      )}
      {commentOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="rounded-2xl border border-[color:var(--client-primary)] p-3 text-[color:var(--client-text)]"
        >
          <label className="block text-sm font-bold">
            {t("comment")}
            <textarea
              autoFocus
              maxLength={1000}
              disabled={saving}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-3"
            />
          </label>
          {saveError ? (
            <p role="alert" className="text-red-500">
              {t("saveError")}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-4">
            <button
              disabled={saving}
              onClick={() => setCommentOpen(false)}
              type="button"
            >
              {t("cancel")}
            </button>
            <button
              disabled={saving || !draft.trim()}
              className="font-bold text-[color:var(--client-primary)] disabled:opacity-50"
              type="submit"
            >
              {t(saving ? "saving" : "submit")}
            </button>
          </div>
        </form>
      ) : null}
      {data ? (
        <FormalTimelinePagination
          ariaLabel={t("timeline")}
          page={page}
          pageSize={pageSize}
          total={data.total}
          disabled={loading}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPage(1);
            setPageSize(value);
          }}
        />
      ) : null}
    </div>
  );
}
