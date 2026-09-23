import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold } from "../../components/client-ui/AppScaffold";
import { ApiClientError } from "../../api/httpClient";
import { bookingApi, createBookingIdempotencyKey, type BookingGroup, type BookingOrder } from "../../features/booking/api";
import { yen } from "../../lib/utils";
import { GroupBookingEditor, type ReadyGroupBooking } from "./formal-checkout/GroupBookingEditor";
import { useCheckoutText } from "./formal-checkout/i18n";

function orderSelections(order: BookingOrder): { serviceIds: number[]; slotIds: Set<number> } {
  const snapshot = order.serviceSnapshot;
  const bundle = snapshot && typeof snapshot === "object" && "bundle" in snapshot && Array.isArray(snapshot.bundle)
    ? snapshot.bundle : [];
  const key = order.pricingModeSnapshot === "technician" ? "technicianServiceId" : "serviceId";
  const serviceIds = bundle.map((item) => item && typeof item === "object" && key in item ? item[key] : null)
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  const slotIds = bundle.map((item) => item && typeof item === "object" && "scheduleSlotId" in item ? item.scheduleSlotId : null)
    .filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  return { serviceIds: serviceIds.length ? serviceIds : [order.technicianServiceId ?? order.serviceId].filter((id): id is number => id !== null),
    slotIds: new Set(slotIds.length ? slotIds : [order.scheduleSlotId]) };
}

export function BookingGroupPage() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { t } = useCheckoutText();
  const statusKeys = {
    pending: "groupBookingStatusPending", confirmed: "groupBookingStatusConfirmed",
    inService: "groupBookingStatusInService", awaitingCheckout: "groupBookingStatusAwaitingCheckout",
    awaitingPaymentConfirmation: "groupBookingStatusAwaitingPaymentConfirmation",
    completed: "groupBookingStatusCompleted", cancelled: "groupBookingStatusCancelled"
  } as const;
  const [group, setGroup] = useState<BookingGroup | null>(null);
  const [failed, setFailed] = useState(false);
  const [editingOrder, setEditingOrder] = useState<BookingOrder | null>(null);
  const [ready, setReady] = useState<ReadyGroupBooking | null>(null);
  const [removingGuestId, setRemovingGuestId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const revisionKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const removalKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const selections = useMemo(() => editingOrder ? orderSelections(editingOrder) : null, [editingOrder]);
  const onEditorChange = useCallback((value: ReadyGroupBooking | null) => setReady(value), []);
  useEffect(() => {
    if (!publicId) return;
    let active = true;
    void bookingApi.getGroupBooking(publicId).then((result) => {
      if (active) setGroup(result);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [publicId]);
  const mutationMessage = (error: unknown) => {
    if (error instanceof ApiClientError) {
      if (error.message === "error.booking.group_revision_financial_unavailable") return t("groupBookingPaidEditUnavailable");
      if (error.message === "error.booking.group_revision_conflict") return t("groupBookingRevisionConflict");
      if (error.message === "error.booking.price_changed") return t("priceUpdated");
      if (error.status === 409) return t("bookingStateChanged");
    }
    return t("groupBookingMutationFailed");
  };
  const revise = async () => {
    if (!publicId || !editingOrder || !ready || busy) return;
    const assignment = ready.guests[0]?.assignments[0];
    if (!assignment) return;
    const body = { expectedUpdatedAt: editingOrder.updatedAt, assignment };
    const fingerprint = JSON.stringify({ orderId: editingOrder.id, ...body });
    if (revisionKey.current?.fingerprint !== fingerprint) revisionKey.current = { fingerprint, key: createBookingIdempotencyKey() };
    setBusy(true); setMutationError(null);
    try {
      const result = await bookingApi.reviseGroupOrder(publicId, editingOrder.id, body, revisionKey.current.key);
      setGroup(result.group); setEditingOrder(null); setReady(null); revisionKey.current = null;
    } catch (error) { setMutationError(mutationMessage(error)); }
    finally { setBusy(false); }
  };
  const removeGuest = async (guestId: number) => {
    if (!publicId || !group || busy) return;
    const guest = group.guests.find((item) => item.id === guestId);
    if (!guest) return;
    const expectedOrders = guest.orders.filter((order) => order.status !== "cancelled")
      .map((order) => ({ id: order.id, updatedAt: order.updatedAt }));
    const fingerprint = JSON.stringify({ guestId, expectedOrders });
    if (removalKey.current?.fingerprint !== fingerprint) removalKey.current = { fingerprint, key: createBookingIdempotencyKey() };
    setBusy(true); setMutationError(null);
    try {
      const result = await bookingApi.removeGroupGuest(publicId, guestId, expectedOrders, removalKey.current.key);
      setGroup(result.group); setRemovingGuestId(null); removalKey.current = null;
    } catch (error) { setMutationError(mutationMessage(error)); }
    finally { setBusy(false); }
  };
  return <PageScaffold contentClassName="space-y-4 pb-12" navItems={[]}>
    <AppTopBar closeLabel={t("closeCheckout")} onBack={() => navigate(-1)} title={t("groupBookingTitle")} />
    {failed ? <p role="alert" className="rounded-xl border border-red-400 p-4 text-sm text-red-500">{t("groupBookingLoadFailed")}</p> : null}
    {mutationError ? <p role="alert" className="rounded-xl border border-red-400 p-4 text-sm text-red-500">{mutationError}</p> : null}
    {!failed && !group ? <p className="p-4 text-sm">{t("loadingCheckout")}</p> : null}
    {group ? <>
      <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
        <p className="text-xs text-[color:var(--client-muted)]">{new Date(group.startsAt).toLocaleString()}</p>
        <strong className="mt-2 block text-2xl text-[color:var(--client-primary)]">{yen(group.totalPriceAmountJpy)}</strong>
      </div>
      {group.guests.map((guest) => <section key={guest.id} className="space-y-2 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
        <h2 className="font-black">{t("groupBookingGuest", { count: String(guest.position + 1) })} · {guest.label}{guest.orders.length && guest.orders.every((order) => order.status === "cancelled") ? ` · ${t("groupBookingGuestRemoved")}` : ""}</h2>
        {guest.orders.map((order) => <div key={order.id} className="space-y-2 rounded-xl border border-[color:var(--client-line)] p-3">
          <Link to={`/orders/${order.id}`} className="block">
            <span className="block text-sm font-bold">{order.serviceName}</span>
            <span className="mt-1 block text-xs text-[color:var(--client-muted)]">{order.technicianName} · {t(statusKeys[order.status])} · {yen(order.paymentAmountJpy)}</span>
            <span className="mt-2 block text-xs font-black text-[color:var(--client-primary)]">{t("groupBookingViewOrder")}</span>
          </Link>
          {order.status === "pending" && order.paymentStatus === "pending" ? <button type="button" className="text-sm font-bold text-[color:var(--client-primary)]" onClick={() => {
            setEditingOrder(order); setReady(null); setMutationError(null); revisionKey.current = null;
          }}>{t("groupBookingReviseOrder")}</button> : order.status !== "cancelled" ? <p className="text-xs text-[color:var(--client-muted)]">{t("groupBookingPaidEditUnavailable")}</p> : null}
          {editingOrder?.id === order.id && selections ? <div className="space-y-3">
            <GroupBookingEditor key={order.id} shopId={group.shopId} startsAt={group.startsAt}
              initialGuestCount={1} initialTechnicianId={order.technicianProfileId ?? 0}
              initialServiceIds={selections.serviceIds}
              catalog={order.pricingModeSnapshot === "technician" ? "technician_service" : "shop_service"}
              ownedSlotIds={selections.slotIds} singleAssignment onChange={onEditorChange} />
            {ready ? <p className="text-sm">{t("groupBookingPriceDifference", {
              old: yen(Number(order.priceAmount)), next: yen(ready.totalPriceAmountJpy),
              difference: yen(ready.totalPriceAmountJpy - Number(order.priceAmount))
            })}</p> : null}
            <div className="flex flex-wrap gap-3">
              <button type="button" disabled={!ready || busy} className="rounded-lg bg-[color:var(--client-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" onClick={() => void revise()}>{t("groupBookingConfirmRevision")}</button>
              <button type="button" disabled={busy} className="text-sm" onClick={() => { setEditingOrder(null); setReady(null); }}>{t("groupBookingBack")}</button>
            </div>
          </div> : null}
        </div>)}
        {guest.orders.some((order) => order.status !== "cancelled") &&
          guest.orders.every((order) => order.status === "cancelled" || (order.status === "pending" && order.paymentStatus === "pending"))
          ? removingGuestId === guest.id ? <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">{t("groupBookingRemoveConfirm")}</span>
            <button type="button" disabled={busy} className="text-sm font-bold text-red-600" onClick={() => void removeGuest(guest.id)}>{t("groupBookingConfirmRemove")}</button>
            <button type="button" disabled={busy} className="text-sm" onClick={() => setRemovingGuestId(null)}>{t("groupBookingBack")}</button>
          </div> : <button type="button" className="text-sm font-bold text-red-600" onClick={() => { setRemovingGuestId(guest.id); setMutationError(null); }}>{t("groupBookingRemoveGuest")}</button>
          : null}
      </section>)}
    </> : null}
  </PageScaffold>;
}
