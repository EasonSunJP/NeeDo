import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import {
  workStatusApi,
  type WorkStatus,
  type WorkStatusMutation,
  type AffectedWorkOrder,
} from "./api";
import { useWorkStatus } from "./hooks";
import { useWorkText } from "./i18n";
import { TechnicianAutomationQuickSwitches } from "../technician-schedule/TechnicianAutomationQuickSwitches";
const buttons = [
  { status: "on_duty", icon: "●", tone: "duty" },
  { status: "traveling", icon: "↗", tone: "travel" },
  { status: "in_service", icon: "▶", tone: "service" },
  { status: "resting", icon: "☾", tone: "rest" },
  { status: "off_duty", icon: "■", tone: "off" },
] as const;
export function WorkStatusControls({
  disabled = false,
  disabledReason,
  serviceOrderId,
  shopId,
  onChanged,
  onChooseService,
}: {
  disabled?: boolean;
  disabledReason?: string;
  serviceOrderId?: number;
  shopId?: number | null;
  onChanged?: () => void;
  onChooseService?: () => void;
}) {
  const { t, language } = useWorkText();
  const navigate = useNavigate();
  const { snapshot, error, loading, reload, accept } = useWorkStatus({
    scope: "technician",
  });
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(false),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState("");
  const [affectedOrders, setAffectedOrders] = useState<AffectedWorkOrder[]>([]);
  const pending = useRef<WorkStatusMutation | null>(null);
  const submit = async (status: WorkStatus, confirmed = false) => {
    if (disabled && status !== "off_duty") return;
    if (status === "in_service") {
      if (saving) return;
      setSaving(true);
      setSaveError(false);
      try {
        const latest = await workStatusApi.snapshot({ scope: "technician" });
        accept(latest);
        const orderId = latest.activeOrderId ?? serviceOrderId;
        if (orderId) navigate(`/technician/orders/${orderId}`);
        else onChooseService?.();
      } catch {
        setSaveError(true);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!snapshot || saving || status === "unsynced") return;
    const retry =
      pending.current?.status === status &&
      pending.current.expectedVersion === snapshot.version &&
      Boolean(pending.current.confirmEarlyLeave) === confirmed &&
      pending.current.reason === (confirmed ? reason.trim() : undefined) &&
      pending.current.shopId === (shopId || undefined);
    const input: WorkStatusMutation = retry
      ? pending.current!
      : {
          status,
          expectedVersion: snapshot.version,
          idempotencyKey: crypto.randomUUID(),
          ...(shopId ? { shopId } : {}),
          ...(confirmed
            ? { confirmEarlyLeave: true, reason: reason.trim() }
            : {}),
        };
    pending.current = input;
    setSaving(true);
    setSaveError(false);
    try {
      accept(await workStatusApi.update(input));
      pending.current = null;
      setConfirm(false);
      setReason("");
      onChanged?.();
    } catch (error) {
      const data = error instanceof ApiClientError ? error.data : null;
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        data &&
        typeof data === "object" &&
        "reason" in data &&
        data.reason === "early_leave_confirmation_required"
      ) {
        pending.current = null;
        setAffectedOrders(
          "affectedOrders" in data && Array.isArray(data.affectedOrders)
            ? data.affectedOrders
            : [],
        );
        setConfirm(true);
      } else {
        setSaveError(true);
        if (error instanceof ApiClientError && error.status === 409) {
          pending.current = null;
          await reload();
        }
      }
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 text-[color:var(--client-text)] shadow-[var(--client-shadow)]"
      data-testid="technician-formal-status-sync"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Link
          className="rounded-full bg-[color:var(--client-primary)] px-4 py-3 text-sm font-black text-[color:var(--client-needo-text)]"
          to="/technician/schedule"
        >
          {t("schedule")}
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {buttons.map((item) => (
          <button
            type="button"
            data-status={item.status}
            aria-pressed={snapshot?.status === item.status}
            disabled={(disabled && item.status !== "off_duty") || !snapshot || saving || Boolean(error)}
            key={item.status}
            onClick={() => void submit(item.status)}
            className={`technician-work-status-button technician-work-status--${item.tone} ${snapshot?.status === item.status ? "technician-work-status-button--active" : "technician-work-status-button--idle"} flex min-h-[88px] min-w-0 flex-col items-center justify-center rounded-[20px] border px-1 py-3 disabled:opacity-50`}
          >
            <span
              aria-hidden="true"
              className="technician-work-status-icon inline-flex h-9 w-9 items-center justify-center rounded-[14px]"
            >
              {item.icon}
            </span>
            <strong className="mt-2 text-xs">{t(item.status)}</strong>
          </button>
        ))}
      </div>
      {disabled ? (
        <p
          className="mt-3 rounded-[18px] border border-[#ff4d5e] bg-[#26060b] px-4 py-3 text-sm font-bold leading-6 text-[#ffd6dc]"
          role="alert"
        >
          {disabledReason ?? t("shopRequired")}
        </p>
      ) : null}
      <div
        className="mt-3 rounded-[20px] bg-[color:var(--client-elevated)] px-4 py-3"
        aria-live="polite"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[color:var(--client-muted)]">
              {t("synced")}
            </p>
            <p className="mt-1 font-bold">
              {saving
                ? t("saving")
                : snapshot
                  ? t(snapshot.status)
                  : loading
                    ? t("loading")
                    : t("unsynced")}
            </p>
          </div>
          {!disabled && snapshot?.status === "on_duty" ? <TechnicianAutomationQuickSwitches /> : null}
        </div>
      </div>
      {error || saveError ? (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {t(saveError ? "saveError" : "error")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void reload()}
          >
            {t("retry")}
          </button>
        </p>
      ) : null}
      {confirm ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("leaveTitle")}
            className="w-full max-w-sm rounded-3xl border border-[color:var(--client-line)] bg-[color:var(--client-bg)] p-5"
          >
            <h3 className="font-bold">{t("leaveTitle")}</h3>
            <p className="mt-3 text-sm">{t("leaveInfo")}</p>
            {affectedOrders.length ? (
              <div className="mt-3 text-sm">
                <p className="font-bold">{t("affectedOrders")}</p>
                <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {affectedOrders.map((order) => (
                    <li
                      key={order.id}
                      className="rounded-xl bg-[color:var(--client-surface)] p-2"
                    >
                      <Link
                        className="font-bold underline"
                        to={`/technician/orders/${order.id}`}
                      >
                        {order.orderNo ?? `#${order.id}`}
                      </Link>
                      {order.serviceName ? ` · ${order.serviceName}` : ""}
                      <time
                        className="block text-xs text-[color:var(--client-muted)]"
                        dateTime={order.startsAt}
                      >
                        {new Date(order.startsAt).toLocaleString(
                          language === "zh" ? "zh-CN" : language,
                          {
                            timeZone: "Asia/Tokyo",
                          },
                        )}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label className="mt-4 block">
              {t("reason")}
              <textarea
                autoFocus
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2 w-full rounded-xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-3"
              />
            </label>
            <div className="mt-4 flex justify-end gap-3">
              <button
                disabled={saving}
                onClick={() => setConfirm(false)}
                type="button"
              >
                {t("cancel")}
              </button>
              <button
                disabled={saving || !reason.trim()}
                onClick={() => void submit("off_duty", true)}
                className="rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-[color:var(--client-needo-text)] disabled:opacity-50"
                type="button"
              >
                {t("confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
