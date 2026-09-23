// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupBookingEditor, type ReadyGroupBooking } from "./GroupBookingEditor";

const mocked = vi.hoisted(() => ({
  getMine: vi.fn(), getBookingNavigation: vi.fn(), getShopDetail: vi.fn(), loadAvailabilityWindow: vi.fn()
}));
vi.mock("../../../features/platform-membership/api", () => ({ platformMembershipSelfApi: { getMine: mocked.getMine } }));
vi.mock("../../../features/pricing-mode/api", () => ({ pricingModeApi: { getBookingNavigation: mocked.getBookingNavigation } }));
vi.mock("../../../features/core-read/api", () => ({ coreReadApi: { getShopDetail: mocked.getShopDetail } }));
vi.mock("../../../features/booking/window-loaders", () => ({ loadAvailabilityWindow: mocked.loadAvailabilityWindow }));
vi.mock("./i18n", () => ({ useCheckoutText: () => ({ t: (key: string) => key }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const start = "2026-10-02T01:00:00.000Z";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocked.getMine.mockResolvedValue({ tierCode: "black_diamond" });
  mocked.getBookingNavigation.mockResolvedValue({ entry: "service_menu", services: { list: [{ id: 101, name: "Hair", priceAmount: "8000", durationMinutes: 60 }], total: 1 } });
  mocked.getShopDetail.mockResolvedValue({ technicians: [{ id: 11, displayName: "A" }, { id: 12, displayName: "B" }] });
  mocked.loadAvailabilityWindow.mockImplementation(({ technicianId }: { technicianId: number }) => Promise.resolve([{
    id: technicianId + 100, shopId: 5, technicianProfileId: technicianId, serviceId: 101, technicianServiceId: null,
    startsAt: start, endsAt: "2026-10-02T02:00:00.000Z", capacity: 1, bookedCount: 0,
    status: "available", serviceName: "Hair", shopName: "Shop", technicianName: "A",
    priceAmount: "8000", currency: "JPY", durationMinutes: 60, nominationFeeJpy: 500
  }]));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

it("keeps submission unavailable until every guest has a distinct technician and service", async () => {
  const onChange = vi.fn<(ready: ReadyGroupBooking | null) => void>();
  await act(async () => root.render(<GroupBookingEditor
    catalog="shop_service" initialGuestCount={2} initialServiceIds={[101]}
    initialTechnicianId={11} onChange={onChange} shopId={5} startsAt={start}
  />));
  expect(onChange).toHaveBeenLastCalledWith(null);
  const technicianSelect = Array.from(container.querySelectorAll("select"))[2]!;
  await act(async () => {
    technicianSelect.value = "12";
    technicianSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const addService = Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "groupBookingAddService").at(-1)!;
  await act(async () => addService.click());
  const serviceSelect = Array.from(container.querySelectorAll("select"))[3]!;
  await act(async () => {
    serviceSelect.value = "101";
    serviceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ totalPriceAmountJpy: 17_000 }));
  expect(mocked.loadAvailabilityWindow).toHaveBeenCalledWith(expect.objectContaining({
    shopId: 5, technicianId: 12, serviceId: 101,
    from: start, to: "2026-10-02T01:00:00.001Z"
  }));
  const last = onChange.mock.lastCall?.[0];
  expect(last?.guests.map((guest) => guest.assignments[0]?.technicianProfileId)).toEqual([11, 12]);
});
