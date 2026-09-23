import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppTopBar, PageScaffold } from "../../components/client-ui/AppScaffold";
import { bookingApi, type BookingGroup } from "../../features/booking/api";
import { yen } from "../../lib/utils";
import { useCheckoutText } from "./formal-checkout/i18n";

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
  useEffect(() => {
    if (!publicId) return;
    let active = true;
    void bookingApi.getGroupBooking(publicId).then((result) => {
      if (active) setGroup(result);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [publicId]);
  return <PageScaffold contentClassName="space-y-4 pb-12" navItems={[]}>
    <AppTopBar closeLabel={t("closeCheckout")} onBack={() => navigate(-1)} title={t("groupBookingTitle")} />
    {failed ? <p role="alert" className="rounded-xl border border-red-400 p-4 text-sm text-red-500">{t("groupBookingLoadFailed")}</p> : null}
    {!failed && !group ? <p className="p-4 text-sm">{t("loadingCheckout")}</p> : null}
    {group ? <>
      <div className="rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
        <p className="text-xs text-[color:var(--client-muted)]">{new Date(group.startsAt).toLocaleString()}</p>
        <strong className="mt-2 block text-2xl text-[color:var(--client-primary)]">{yen(group.totalPriceAmountJpy)}</strong>
      </div>
      {group.guests.map((guest) => <section key={guest.id} className="space-y-2 rounded-2xl border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4">
        <h2 className="font-black">{t("groupBookingGuest", { count: String(guest.position + 1) })} · {guest.label}</h2>
        {guest.orders.map((order) => <Link key={order.id} to={`/orders/${order.id}`} className="block rounded-xl border border-[color:var(--client-line)] p-3">
          <span className="block text-sm font-bold">{order.serviceName}</span>
          <span className="mt-1 block text-xs text-[color:var(--client-muted)]">{order.technicianName} · {t(statusKeys[order.status])} · {yen(order.paymentAmountJpy)}</span>
          <span className="mt-2 block text-xs font-black text-[color:var(--client-primary)]">{t("groupBookingViewOrder")}</span>
        </Link>)}
      </section>)}
    </> : null}
  </PageScaffold>;
}
