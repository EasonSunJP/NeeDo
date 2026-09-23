import { useEffect, useMemo, useState } from "react";
import { coreReadApi } from "../../../features/core-read/api";
import { loadAvailabilityWindow } from "../../../features/booking/window-loaders";
import type { BookingScheduleSlot, CreateBookingGroupInput } from "../../../features/booking/api";
import { resolveGroupBookingDraft, type GroupGuestDraft } from "../../../features/booking/group-booking-plan";
import { platformMembershipSelfApi, type MyPlatformMembership } from "../../../features/platform-membership/api";
import { pricingModeApi, type BookingNavigationService, type TechnicianServicePayload } from "../../../features/pricing-mode/api";
import { yen } from "../../../lib/utils";
import { useCheckoutText } from "./i18n";

type CatalogService = { id: number; name: string; priceAmount: number; durationMinutes: number };
type Technician = { id: number; name: string };
const NO_OWNED_SLOTS = new Set<number>();
export type ReadyGroupBooking = CreateBookingGroupInput & { totalPriceAmountJpy: number };

export function GroupBookingEditor({
  shopId, startsAt, initialGuestCount, initialTechnicianId, initialServiceIds, catalog,
  onChange, singleAssignment = false, ownedSlotIds = NO_OWNED_SLOTS
}: {
  shopId: number;
  startsAt: string;
  initialGuestCount: number;
  initialTechnicianId: number;
  initialServiceIds: number[];
  catalog: "shop_service" | "technician_service";
  onChange: (ready: ReadyGroupBooking | null) => void;
  singleAssignment?: boolean;
  ownedSlotIds?: ReadonlySet<number>;
}) {
  const { t } = useCheckoutText();
  const [tier, setTier] = useState<MyPlatformMembership["tierCode"] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [shopServices, setShopServices] = useState<CatalogService[]>([]);
  const [technicianServices, setTechnicianServices] = useState<Record<number, CatalogService[]>>({});
  const [slots, setSlots] = useState<BookingScheduleSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [guests, setGuests] = useState<GroupGuestDraft[]>(() => Array.from({ length: initialGuestCount }, (_, index) => ({
    label: t("groupBookingGuest", { count: String(index + 1) }), assignments: [{
      technicianProfileId: index === 0 ? initialTechnicianId : null,
      serviceIds: index === 0 ? initialServiceIds : []
    }]
  })));

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    void Promise.all([
      platformMembershipSelfApi.getMine(),
      pricingModeApi.getBookingNavigation(shopId, { page: 1, pageSize: 100 }),
      catalog === "shop_service" ? coreReadApi.getShopDetail(shopId) : Promise.resolve(null)
    ]).then(async ([membership, navigation, shop]) => {
      if ((catalog === "shop_service" && navigation.entry !== "service_menu") ||
          (catalog === "technician_service" && navigation.entry !== "technician_list")) throw new Error("pricing_mode_changed");
      const allServices: BookingNavigationService[] = [];
      const allTechnicians: Technician[] = [];
      if (navigation.entry === "service_menu") {
        allServices.push(...navigation.services.list);
        for (let page = 2; allServices.length < navigation.services.total; page += 1) {
          const next = await pricingModeApi.getBookingNavigation(shopId, { page, pageSize: 100 });
          if (next.entry !== "service_menu" || !next.services.list.length) break;
          allServices.push(...next.services.list);
        }
        allTechnicians.push(...(shop?.technicians ?? []).map((item) => ({ id: item.id, name: item.displayName })));
      } else {
        allTechnicians.push(...navigation.technicians.list.map((item) => ({ id: item.id, name: item.displayName })));
        for (let page = 2; allTechnicians.length < navigation.technicians.total; page += 1) {
          const next = await pricingModeApi.getBookingNavigation(shopId, { page, pageSize: 100 });
          if (next.entry !== "technician_list" || !next.technicians.list.length) break;
          allTechnicians.push(...next.technicians.list.map((item) => ({ id: item.id, name: item.displayName })));
        }
      }
      if (!active) return;
      setTier(membership.tierCode);
      setTechnicians(allTechnicians);
      setShopServices(allServices.map((item) => ({ id: item.id, name: item.name, priceAmount: Number(item.priceAmount), durationMinutes: item.durationMinutes })));
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [catalog, shopId]);

  const selectedTechnicianIds = useMemo(() => Array.from(new Set(guests.flatMap((guest) => guest.assignments.map((assignment) => assignment.technicianProfileId).filter((id): id is number => Boolean(id))))), [guests]);
  useEffect(() => {
    if (catalog !== "technician_service") return;
    let active = true;
    const missing = selectedTechnicianIds.filter((id) => technicianServices[id] === undefined);
    if (!missing.length) return;
    void Promise.all(missing.map(async (technicianId) => {
      const services: TechnicianServicePayload[] = [];
      for (let page = 1; ; page += 1) {
        const response = await pricingModeApi.listPublicTechnicianServices(shopId, technicianId, { page, pageSize: 100 });
        services.push(...response.list);
        if (services.length >= response.total || !response.list.length) break;
      }
      return { technicianId, services: services.map((item) => ({ id: item.id, name: item.name, priceAmount: item.priceAmount, durationMinutes: item.durationMinutes })) };
    })).then((loaded) => {
      if (active) setTechnicianServices((current) => Object.fromEntries([...Object.entries(current), ...loaded.map((item) => [item.technicianId, item.services])]));
    }).catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [catalog, selectedTechnicianIds, shopId, technicianServices]);

  const slotQueries = useMemo(() => {
    const queries: Array<{ technicianId: number; serviceId: number; from: string }> = [];
    for (const assignment of guests.flatMap((guest) => guest.assignments)) {
      if (!assignment.technicianProfileId) continue;
      const services = catalog === "shop_service" ? shopServices : technicianServices[assignment.technicianProfileId] ?? [];
      let nextStart = Date.parse(startsAt);
      for (const id of assignment.serviceIds) {
        const service = services.find((item) => item.id === id);
        if (!service || !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes < 1) break;
        queries.push({ technicianId: assignment.technicianProfileId, serviceId: id, from: new Date(nextStart).toISOString() });
        nextStart += service.durationMinutes * 60_000;
      }
    }
    return queries;
  }, [catalog, guests, shopServices, startsAt, technicianServices]);
  const slotQueryKey = JSON.stringify(slotQueries);
  useEffect(() => {
    let active = true;
    setSlots([]);
    if (!slotQueries.length) { setSlotsLoading(false); return; }
    setSlotsLoading(true);
    void (async () => {
      const results: BookingScheduleSlot[] = [];
      for (let index = 0; index < slotQueries.length; index += 5) {
        const batch = await Promise.all(slotQueries.slice(index, index + 5).map(({ technicianId, serviceId, from }) =>
          loadAvailabilityWindow({
            shopId, technicianId, from, to: new Date(Date.parse(from) + 1).toISOString(),
            ...(singleAssignment ? { includeUnavailable: true } : {}),
            ...(catalog === "shop_service" ? { serviceId } : { technicianServiceId: serviceId })
          })
        ));
        if (!active) return;
        results.push(...batch.flat());
      }
      setSlots(results);
    })()
      .catch(() => { if (active) setLoadFailed(true); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [catalog, shopId, singleAssignment, slotQueryKey]);

  const ready = useMemo(() => tier && !loadFailed && !slotsLoading &&
    (tier === "black_diamond" || guests.length === 1)
    ? resolveGroupBookingDraft({ shopId, startsAt, catalog, guests }, slots, ownedSlotIds)
    : null, [catalog, guests, loadFailed, ownedSlotIds, shopId, slots, slotsLoading, startsAt, tier]);
  useEffect(() => onChange(ready), [onChange, ready]);

  const updateGuest = (guestIndex: number, update: (guest: GroupGuestDraft) => GroupGuestDraft) => {
    setGuests((current) => current.map((guest, index) => index === guestIndex ? update(guest) : guest));
  };
  const updateAssignment = (guestIndex: number, assignmentIndex: number, update: (assignment: GroupGuestDraft["assignments"][number]) => GroupGuestDraft["assignments"][number]) => {
    updateGuest(guestIndex, (guest) => ({ ...guest, assignments: guest.assignments.map((assignment, index) => index === assignmentIndex ? update(assignment) : assignment) }));
  };
  const maxGuests = tier === "black_diamond" ? Math.min(10, technicians.length) : 1;

  return (
    <section className="space-y-3 rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4" aria-label={t("groupBookingTitle")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-black">{t("groupBookingTitle")}</h3>
        <span className="text-sm font-black text-[color:var(--client-primary)]">{ready ? yen(ready.totalPriceAmountJpy) : "—"}</span>
      </div>
      <p className="text-xs text-[color:var(--client-muted)]">{t("groupBookingHint")}</p>
      {loadFailed ? <p role="alert" className="text-sm text-red-500">{t("groupBookingLoadFailed")}</p> : null}
      {tier && tier !== "black_diamond" && guests.length > 1 ? <p role="alert" className="text-sm text-red-500">{t("groupBookingMembershipLimit")}</p> : null}
      {guests.map((guest, guestIndex) => (
        <div className="space-y-3 rounded-2xl border border-[color:var(--client-line)] p-3" key={guestIndex}>
          <div className="flex items-center gap-2">
            <label className="min-w-0 flex-1 text-xs font-bold">{t("groupBookingGuest", { count: String(guestIndex + 1) })}
              <input className="mt-1 h-10 w-full rounded-lg border border-[color:var(--client-line)] bg-transparent px-3 text-sm" maxLength={60} value={guest.label} disabled={singleAssignment} onChange={(event) => updateGuest(guestIndex, (current) => ({ ...current, label: event.target.value }))} />
            </label>
            {!singleAssignment && guests.length > 1 ? <button type="button" className="text-xs font-bold text-red-500" onClick={() => setGuests((current) => current.filter((_, index) => index !== guestIndex))}>{t("groupBookingRemoveGuest")}</button> : null}
          </div>
          {guest.assignments.map((assignment, assignmentIndex) => {
            const availableServices = catalog === "shop_service" ? shopServices : technicianServices[assignment.technicianProfileId ?? 0] ?? [];
            const selectedPrice = ready?.guests[guestIndex]?.assignments[assignmentIndex]?.expectedPriceAmountJpy;
            return (
              <div className="space-y-2 rounded-xl bg-[color:var(--client-primary-soft)] p-3" key={assignmentIndex}>
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1 text-xs font-bold">{t("groupBookingTechnician")}
                    <select className="mt-1 h-10 w-full rounded-lg border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-2 text-sm" value={assignment.technicianProfileId ?? ""} onChange={(event) => updateAssignment(guestIndex, assignmentIndex, () => ({ technicianProfileId: Number(event.target.value) || null, serviceIds: [] }))}>
                      <option value="">{t("groupBookingChoose")}</option>
                      {technicians.filter((item) => item.id === assignment.technicianProfileId || !selectedTechnicianIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  {guest.assignments.length > 1 ? <button type="button" className="text-xs font-bold text-red-500" onClick={() => updateGuest(guestIndex, (current) => ({ ...current, assignments: current.assignments.filter((_, index) => index !== assignmentIndex) }))}>{t("groupBookingRemoveTechnician")}</button> : null}
                </div>
                {assignment.serviceIds.map((serviceId, serviceIndex) => <div className="flex items-end gap-2" key={serviceIndex}>
                  <label className="min-w-0 flex-1 text-xs font-bold">{t("groupBookingService", { count: String(serviceIndex + 1) })}
                    <select className="mt-1 h-10 w-full rounded-lg border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-2 text-sm" value={serviceId || ""} onChange={(event) => updateAssignment(guestIndex, assignmentIndex, (current) => ({ ...current, serviceIds: current.serviceIds.map((id, index) => index === serviceIndex ? Number(event.target.value) : id) }))}>
                      <option value="">{t("groupBookingChoose")}</option>
                      {availableServices.filter((item) => item.id === serviceId || !assignment.serviceIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {yen(item.priceAmount)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="h-10 text-xs font-bold text-red-500" onClick={() => updateAssignment(guestIndex, assignmentIndex, (current) => ({ ...current, serviceIds: current.serviceIds.filter((_, index) => index !== serviceIndex) }))}>{t("groupBookingRemoveService")}</button>
                </div>)}
                {assignment.technicianProfileId && assignment.serviceIds.length < 10 ? <button type="button" className="text-xs font-bold text-[color:var(--client-primary)]" onClick={() => updateAssignment(guestIndex, assignmentIndex, (current) => ({ ...current, serviceIds: [...current.serviceIds, 0] }))}>{t("groupBookingAddService")}</button> : null}
                {selectedPrice !== undefined ? <p className="text-right text-sm font-black">{yen(selectedPrice)}</p> : null}
              </div>
            );
          })}
          {!singleAssignment && selectedTechnicianIds.length < 10 && technicians.length > selectedTechnicianIds.length ? <button type="button" className="text-xs font-bold text-[color:var(--client-primary)]" onClick={() => updateGuest(guestIndex, (current) => ({ ...current, assignments: [...current.assignments, { technicianProfileId: null, serviceIds: [] }] }))}>{t("groupBookingAddTechnician")}</button> : null}
        </div>
      ))}
      {!singleAssignment && tier === "black_diamond" && guests.length < maxGuests ? <button type="button" className="text-sm font-black text-[color:var(--client-primary)]" onClick={() => setGuests((current) => [...current, { label: t("groupBookingGuest", { count: String(current.length + 1) }), assignments: [{ technicianProfileId: null, serviceIds: [] }] }])}>{t("groupBookingAddGuest")}</button> : null}
      {slotsLoading ? <p className="text-xs text-[color:var(--client-muted)]">{t("groupBookingChecking")}</p> : !ready && !loadFailed ? <p className="text-xs text-amber-700">{t("groupBookingIncomplete")}</p> : null}
    </section>
  );
}
