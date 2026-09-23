// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BookingGroup } from "../../features/booking/api";
import { BookingGroupPage } from "./BookingGroupPage";

const mocked = vi.hoisted(() => ({ get: vi.fn(), revise: vi.fn(), remove: vi.fn() }));
vi.mock("../../features/booking/api", () => ({
  bookingApi: { getGroupBooking: mocked.get, reviseGroupOrder: mocked.revise, removeGroupGuest: mocked.remove },
  createBookingIdempotencyKey: () => "group-revision-key-0001"
}));
vi.mock("../../components/client-ui/AppScaffold", () => ({
  AppTopBar: ({ title }: { title: string }) => <header>{title}</header>,
  PageScaffold: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));
vi.mock("./formal-checkout/i18n", () => ({ useCheckoutText: () => ({ t: (key: string) => key }) }));
vi.mock("./formal-checkout/GroupBookingEditor", () => ({
  GroupBookingEditor: ({ onChange }: { onChange: (value: unknown) => void }) =>
    <button type="button" onClick={() => onChange({ totalPriceAmountJpy: 15_000, guests: [{ assignments: [{
      technicianProfileId: 11, serviceIds: [102], scheduleSlotIds: [202], expectedPriceAmountJpy: 15_000
    }] }] })}>choose replacement</button>
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const group = {
  id: 1, publicId: "713382d3-7d99-44f7-a54e-a1745fca4848", customerUserId: 7,
  shopId: 5, startsAt: "2026-10-02T01:00:00.000Z", totalPriceAmountJpy: 24_000,
  guests: [
    { id: 31, position: 0, label: "A", orders: [{ id: 11, status: "pending", paymentStatus: "pending",
      updatedAt: "2026-09-23T01:00:00.000Z", priceAmount: "12000.00", paymentAmountJpy: 12_000,
      serviceName: "Hair", technicianName: "Tech A", technicianProfileId: 11, serviceId: 101,
      technicianServiceId: null, scheduleSlotId: 201, pricingModeSnapshot: "merchant",
      serviceSnapshot: { bundle: [{ serviceId: 101, scheduleSlotId: 201 }] } }] },
    { id: 32, position: 1, label: "B", orders: [{ id: 12, status: "pending", paymentStatus: "pending",
      updatedAt: "2026-09-23T01:00:00.000Z", priceAmount: "12000.00", paymentAmountJpy: 12_000,
      serviceName: "Hair", technicianName: "Tech B", technicianProfileId: 12, serviceId: 101,
      technicianServiceId: null, scheduleSlotId: 202, pricingModeSnapshot: "merchant" }] }
  ]
} as unknown as BookingGroup;

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  mocked.get.mockResolvedValue(group);
  mocked.revise.mockResolvedValue({ group, replay: false });
  mocked.remove.mockResolvedValue({ group, replay: false });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

async function render() {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/bookings/groups/${group.publicId}`]}>
    <Routes><Route path="/bookings/groups/:publicId" element={<BookingGroupPage />} /></Routes>
  </MemoryRouter>));
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  expect(button).toBeTruthy();
  await act(async () => button!.click());
}

it("submits an unpaid child revision with its original version and leaves the sibling link visible", async () => {
  await render();
  await click("groupBookingReviseOrder");
  await click("choose replacement");
  expect(container.textContent).toContain("groupBookingPriceDifference");
  await click("groupBookingConfirmRevision");
  expect(mocked.revise).toHaveBeenCalledWith(group.publicId, 11, {
    expectedUpdatedAt: "2026-09-23T01:00:00.000Z",
    assignment: { technicianProfileId: 11, serviceIds: [102], scheduleSlotIds: [202], expectedPriceAmountJpy: 15_000 }
  }, "group-revision-key-0001");
  expect(container.querySelector('a[href="/orders/12"]')).toBeTruthy();
});

it("requires a second tap before removing an entire guest", async () => {
  mocked.remove.mockResolvedValueOnce({ group: { ...group, totalPriceAmountJpy: 12_000,
    guests: [{ ...group.guests[0]!, orders: group.guests[0]!.orders.map((order) => ({ ...order, status: "cancelled" as const })) }, group.guests[1]!] }, replay: false });
  await render();
  await click("groupBookingRemoveGuest");
  expect(mocked.remove).not.toHaveBeenCalled();
  await click("groupBookingConfirmRemove");
  expect(mocked.remove).toHaveBeenCalledWith(group.publicId, 31,
    [{ id: 11, updatedAt: "2026-09-23T01:00:00.000Z" }], "group-revision-key-0001");
  expect(container.textContent).toContain("groupBookingGuestRemoved");
});
