import { useEffect, useMemo, useRef, useState } from "react";
import type { BookingScheduleSlot } from "../../../features/booking/api";
import { cn } from "../../../lib/utils";
import {
  getTokyoSlotParts,
  isCheckoutSlotBookable,
  remainingCheckoutCapacity,
  slotsForCheckoutDate
} from "./checkoutTimeSlots";
import { useCheckoutText } from "./i18n";

export function CheckoutTimeRow({ date, people, slots, selectedSlotId, technicianNominated, nowMs = Date.now(), onSelect }: {
  date: string;
  people: string;
  slots: BookingScheduleSlot[];
  selectedSlotId: number | null;
  technicianNominated: boolean;
  nowMs?: number;
  onSelect: (slotId: number) => void;
}) {
  const { t } = useCheckoutText();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sameDaySlots = useMemo(() => slotsForCheckoutDate(slots, date), [date, slots]);
  const selectedSlot = sameDaySlots.find(
    (slot) => slot.id === selectedSlotId && isCheckoutSlotBookable(slot, nowMs)
  ) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const closeOnPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative mt-2" data-no-i18n ref={rootRef}>
      <div className="grid grid-cols-2 gap-2">
        <button
          aria-controls="formal-checkout-time-options"
          aria-expanded={open}
          aria-label={t("selectBookingTime")}
          className="focus-ring rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4 text-left"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <p className="text-xs font-bold text-[color:var(--client-muted)]">{t("time")}</p>
          <p className="mt-2 text-[22px] font-black text-[color:var(--client-primary)]">
            {selectedSlot ? getTokyoSlotParts(selectedSlot.startsAt)?.time : "—"}
          </p>
          <p className="mt-1 truncate text-[11px] font-semibold text-[color:var(--client-muted)]">
            {technicianNominated ? selectedSlot?.technicianName ?? t("assignedByShop") : t("assignedByShop")}
          </p>
        </button>
        <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] p-4">
          <p className="text-xs font-bold text-[color:var(--client-muted)]">{t("people")}</p>
          <p className="mt-2 text-[22px] font-black text-[color:var(--client-text)]">{people}</p>
          <p className="mt-1 text-[11px] font-semibold text-[color:var(--client-muted)]">
            {t("remainingCapacity", { count: selectedSlot ? remainingCheckoutCapacity(selectedSlot) : 0 })}
          </p>
        </div>
      </div>
      {open ? (
        <div
          aria-label={t("availableTimesAria", { date })}
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 grid max-h-60 gap-2 overflow-y-auto rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-2 shadow-[0_20px_46px_rgba(0,0,0,0.34)]"
          id="formal-checkout-time-options"
          role="listbox"
        >
          {sameDaySlots.map((slot) => {
            const bookable = isCheckoutSlotBookable(slot, nowMs);
            const selected = slot.id === selectedSlotId;
            const time = getTokyoSlotParts(slot.startsAt)?.time ?? "—";
            return (
              <button
                aria-selected={selected}
                className={cn(
                  "rounded-[16px] border px-4 py-3 text-left text-sm font-black",
                  selected && bookable
                    ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary)]"
                    : bookable
                      ? "border-[color:var(--client-line)] text-[color:var(--client-text)]"
                      : "cursor-not-allowed border-[color:var(--client-line)] bg-[color:var(--client-elevated)] text-[color:var(--client-muted)] opacity-45"
                )}
                disabled={!bookable}
                key={slot.id}
                onClick={() => {
                  onSelect(slot.id);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {time}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
