import { useMemo, useRef, useState } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import {
  entityEngagementApi,
  type EntityTarget,
} from "../../features/entity-engagement/api";
import { realtimeApi } from "../../features/realtime/api";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { entityShareCopy } from "./i18n";
import { useEntityShareDestinations } from "./useEntityShareDestinations";

const newKey = () => globalThis.crypto.randomUUID();

export function EntityShareDestinationSheet({
  onClose,
  onShareCountChange,
  target,
  targetLabel,
}: {
  onClose: () => void;
  onShareCountChange?: (shareCount: number) => void;
  target: EntityTarget;
  targetLabel: string;
}) {
  const language = useOptionalI18n()?.language ?? "zh";
  const copy = entityShareCopy[language];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [succeeded, setSucceeded] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [partialFailure, setPartialFailure] = useState(false);
  const idempotencyKeys = useRef(new Map<string, string>());
  const { destinations, error, loading } = useEntityShareDestinations(query);
  const selectedRows = useMemo(
    () =>
      destinations.filter(
        (item) => selected.has(item.key) && !succeeded.has(item.key),
      ),
    [destinations, selected, succeeded],
  );

  const share = async () => {
    if (sending || selectedRows.length === 0) return;
    setSending(true);
    setPartialFailure(false);
    const outcomes = await Promise.allSettled(
      selectedRows.map(async (destination) => {
        const conversationId =
          destination.kind === "group"
            ? destination.conversationId
            : (
                await realtimeApi.createConversation({
                  participantUserIds: [destination.userId],
                  type: "direct",
                })
              ).id;
        const idempotencyKey =
          idempotencyKeys.current.get(destination.key) ?? newKey();
        idempotencyKeys.current.set(destination.key, idempotencyKey);
        const receipt = await entityEngagementApi.shareThroughNeedo(target, {
          conversationId,
          idempotencyKey,
        });
        return { key: destination.key, shareCount: receipt.shareCount };
      }),
    );
    const nextSucceeded = new Set(succeeded);
    let lastShareCount: number | undefined;
    outcomes.forEach((outcome) => {
      if (outcome.status === "fulfilled") {
        nextSucceeded.add(outcome.value.key);
        lastShareCount = outcome.value.shareCount;
      }
    });
    setSucceeded(nextSucceeded);
    setPartialFailure(
      outcomes.some((outcome) => outcome.status === "rejected"),
    );
    if (lastShareCount !== undefined) onShareCountChange?.(lastShareCount);
    setSending(false);
    if (outcomes.every((outcome) => outcome.status === "fulfilled")) onClose();
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-3 sm:items-center"
      role="dialog"
    >
      <section className="max-h-[min(720px,88dvh)] w-full max-w-lg overflow-hidden rounded-[30px] border border-[#244047] bg-[#031014] text-[#f7f9f7] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[#244047] px-5 py-4">
          <div>
            <h2 className="text-lg font-black">{copy.title}</h2>
            <p className="mt-1 text-xs font-bold text-[#9aacb5]">
              {targetLabel}
            </p>
          </div>
          <button
            aria-label={copy.close}
            className="grid h-10 w-10 place-items-center rounded-full border border-[#244047]"
            onClick={onClose}
            type="button"
          >
            <AppIcon name="close" />
          </button>
        </header>
        <div className="p-4">
          <label className="flex items-center gap-2 rounded-2xl border border-[#244047] bg-[#07181b] px-3">
            <AppIcon className="text-[#b8ff4a]" name="search" />
            <input
              aria-label={copy.search}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9aacb5]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              value={query}
            />
          </label>
        </div>
        <div className="max-h-[48dvh] space-y-2 overflow-y-auto px-4 pb-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-[#9aacb5]">…</p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-red-300">
              {copy.failed}
            </p>
          ) : destinations.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9aacb5]">
              {copy.empty}
            </p>
          ) : (
            destinations.map((destination) => (
              <label
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-[#244047] bg-[#07181b] px-3 py-2"
                key={destination.key}
              >
                <input
                  checked={selected.has(destination.key)}
                  disabled={succeeded.has(destination.key)}
                  onChange={() =>
                    setSelected((current) => {
                      const next = new Set(current);
                      next.has(destination.key)
                        ? next.delete(destination.key)
                        : next.add(destination.key);
                      return next;
                    })
                  }
                  type="checkbox"
                />
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#244047] text-[#b8ff4a]">
                  {destination.avatarUrl ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={destination.avatarUrl}
                    />
                  ) : (
                    <AppIcon
                      name={destination.kind === "group" ? "chat" : "manager"}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">
                    {destination.label}
                  </strong>
                  <span className="block truncate text-xs text-[#9aacb5]">
                    {destination.subtitle}
                  </span>
                </span>
                {succeeded.has(destination.key) ? (
                  <AppIcon className="text-[#b8ff4a]" name="check" />
                ) : null}
              </label>
            ))
          )}
        </div>
        {partialFailure ? (
          <p className="px-5 pb-2 text-xs font-bold text-red-300">
            {copy.failed}
          </p>
        ) : null}
        <footer className="border-t border-[#244047] p-4">
          <button
            className="h-12 w-full rounded-full bg-[#b8ff4a] text-sm font-black text-[#031014] disabled:opacity-40"
            disabled={sending || selectedRows.length === 0}
            onClick={() => void share()}
            type="button"
          >
            {sending ? "…" : `${copy.share} (${selectedRows.length})`}
          </button>
        </footer>
      </section>
    </div>
  );
}
