import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  createExchangeCancellationRequest,
  decideExchangeCancellation,
  getExchangeCancellation
} from "./api";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeCancellation, ExchangeCancellationAction } from "./types";

type DecisionAction = Exclude<ExchangeCancellationAction, "request">;

function statusTextKey(status: NonNullable<ExchangeCancellation["cancellation"]>["status"]): ExchangeTextKey {
  if (status === "accepted") return "cancellationAccepted";
  if (status === "rejected") return "cancellationRejected";
  if (status === "withdrawn") return "cancellationWithdrawn";
  return "cancellationWaiting";
}

function isAmbiguousMutationError(error: unknown) {
  return !(error instanceof ApiClientError) || error.status === 408 || error.status === 429 || error.status >= 500;
}

export function ExchangeOrderCancellationPanel({
  language,
  onCancellationChange,
  onLinkedChange,
  orderId
}: {
  language?: Language;
  onCancellationChange?: (payload: ExchangeCancellation) => void;
  onLinkedChange?: (linked: boolean | null) => void;
  orderId: number;
}) {
  const optionalI18n = useOptionalI18n();
  const activeLanguage = language ?? optionalI18n.language;
  const t = (key: ExchangeTextKey) => exchangeText(key, activeLanguage);
  const [cancellation, setCancellation] = useState<ExchangeCancellation | null>(null);
  const [reason, setReason] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "linked" | "ordinary" | "error">("loading");
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState(false);
  const [revision, setRevision] = useState(0);
  const attemptRef = useRef<{ key: string; signature: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const payload = await getExchangeCancellation(orderId, signal);
      if (signal?.aborted) return;
      setCancellation(payload);
      setLoadState("linked");
      onCancellationChange?.(payload);
      onLinkedChange?.(true);
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof ApiClientError && error.status === 404) {
        setCancellation(null);
        setLoadState("ordinary");
        onLinkedChange?.(false);
        return;
      }
      setLoadState("error");
    }
  }, [onCancellationChange, onLinkedChange, orderId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setMutationError(false);
    attemptRef.current = null;
    onLinkedChange?.(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load, onLinkedChange, revision]);

  async function mutate(action: ExchangeCancellationAction) {
    if (!cancellation || pending || !cancellation.allowedActions.includes(action)) return;
    const normalizedReason = reason.trim();
    if (action === "request" && normalizedReason.length === 0) return;
    const expectedVersion = cancellation.cancellation?.version ?? 0;
    const signature = JSON.stringify([
      orderId,
      action,
      expectedVersion,
      action === "request" ? normalizedReason : null
    ]);
    const attempt = attemptRef.current?.signature === signature
      ? attemptRef.current
      : { key: globalThis.crypto.randomUUID(), signature };
    attemptRef.current = attempt;
    setPending(true);
    setMutationError(false);
    try {
      const payload = action === "request"
        ? await createExchangeCancellationRequest(
            orderId,
            { expectedVersion, reason: normalizedReason },
            attempt.key
          )
        : await decideExchangeCancellation(orderId, action as DecisionAction, expectedVersion, attempt.key);
      setCancellation(payload);
      setReason("");
      attemptRef.current = null;
      onCancellationChange?.(payload);
    } catch (error) {
      if (!isAmbiguousMutationError(error)) attemptRef.current = null;
      setMutationError(true);
      if (error instanceof ApiClientError && error.status === 409) await load();
    } finally {
      setPending(false);
    }
  }

  if (loadState === "loading" || loadState === "ordinary") return null;

  if (loadState === "error") {
    return (
      <section className="rounded-[24px] border border-red-400/35 bg-red-500/10 p-4" data-testid="exchange-order-cancellation" role="alert">
        <p className="text-sm font-black text-red-500">{t("cancellationLoadFailed")}</p>
        <button className="focus-ring mt-3 min-h-11 w-full rounded-full border border-red-400/40 text-sm font-black text-red-500" onClick={() => setRevision((value) => value + 1)} type="button">{t("cancellationRetry")}</button>
      </section>
    );
  }

  if (!cancellation) return null;
  const activeRequest = cancellation.cancellation;

  return (
    <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel" data-testid="exchange-order-cancellation">
      <h2 className="text-base font-black text-[color:var(--client-text)]">{t("cancellationTitle")}</h2>
      <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">{t("cancellationIntro")}</p>

      {activeRequest ? (
        <div className="mt-4 rounded-[18px] bg-[color:var(--client-bg-soft)] p-3">
          <p className="text-sm font-black text-[color:var(--client-primary)]" role="status">{t(statusTextKey(activeRequest.status))}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm font-bold text-[color:var(--client-text)]" data-no-i18n="true">{activeRequest.reason}</p>
        </div>
      ) : null}

      {cancellation.allowedActions.includes("request") ? (
        <label className="mt-4 block">
          <span className="text-xs font-black text-[color:var(--client-muted)]">{t("cancellationReason")}</span>
          <textarea aria-label={t("cancellationReason")} className="focus-ring mt-2 min-h-24 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-bg-soft)] px-3 py-3 text-sm font-bold text-[color:var(--client-text)]" maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t("cancellationReasonPlaceholder")} value={reason} />
        </label>
      ) : null}

      {cancellation.allowedActions.includes("accept") ? (
        <p className="mt-4 rounded-[18px] border border-amber-400/45 bg-amber-400/10 px-3 py-3 text-xs font-bold leading-5 text-[color:var(--client-text)]">{t("cancellationImpact")}</p>
      ) : null}
      {mutationError ? <p className="mt-3 text-xs font-black text-red-500" role="alert">{t("cancellationMutationFailed")}</p> : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {cancellation.allowedActions.includes("request") ? <button className="focus-ring min-h-11 rounded-full bg-red-500 px-4 text-sm font-black text-white disabled:opacity-40" data-action="request-exchange-cancellation" disabled={pending || reason.trim().length === 0} onClick={() => void mutate("request")} type="button">{t(pending ? "cancellationRequesting" : "cancellationRequest")}</button> : null}
        {cancellation.allowedActions.includes("withdraw") ? <button className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black text-[color:var(--client-text)] disabled:opacity-40" data-action="withdraw-exchange-cancellation" disabled={pending} onClick={() => void mutate("withdraw")} type="button">{t("cancellationWithdraw")}</button> : null}
        {cancellation.allowedActions.includes("reject") ? <button className="focus-ring min-h-11 rounded-full border border-[color:var(--client-line)] px-4 text-sm font-black text-[color:var(--client-text)] disabled:opacity-40" data-action="reject-exchange-cancellation" disabled={pending} onClick={() => void mutate("reject")} type="button">{t("cancellationReject")}</button> : null}
        {cancellation.allowedActions.includes("accept") ? <button className="focus-ring min-h-11 rounded-full bg-red-500 px-4 text-sm font-black text-white disabled:opacity-40" data-action="accept-exchange-cancellation" disabled={pending} onClick={() => void mutate("accept")} type="button">{t("cancellationAccept")}</button> : null}
      </div>
    </section>
  );
}
