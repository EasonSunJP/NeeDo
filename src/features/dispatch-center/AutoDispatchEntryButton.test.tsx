// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { shopAutoDispatchApi, type ShopAutoDispatchRule } from "../../api/shopAutoDispatch";
import { AutoDispatchEntryButton } from "./AutoDispatchEntryButton";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../api/shopAutoDispatch", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/shopAutoDispatch")>(),
  shopAutoDispatchApi: { read: vi.fn(), update: vi.fn() }
}));

const rule: ShopAutoDispatchRule = {
  id: 1, shopId: 2, enabled: false, startsOn: null, endsOn: null,
  startMinute: 0, endMinute: 1440, allowStore: true, allowHome: true,
  minimumRating: null, minimumAcceptanceRate: null, maximumCancellationRate: null,
  dailyTechnicianLimit: null, strategy: "balanced", preferredTechnicianIds: [],
  travelMinutesPerKm: 3, strictWindow: true, candidates: [], createdAt: null, updatedAt: null
};

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(shopAutoDispatchApi.read).mockReset().mockResolvedValue(rule);
  vi.mocked(shopAutoDispatchApi.update).mockReset().mockResolvedValue({ ...rule, enabled: true });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("uses the shared switch to save dispatch state while keeping rule settings reachable", async () => {
  await act(async () => root.render(<MemoryRouter><AutoDispatchEntryButton /></MemoryRouter>));
  const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="开启自动派单"]');
  expect(toggle?.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('a[href="/merchant/schedule/auto-dispatch"]')).not.toBeNull();

  await act(async () => toggle?.click());
  expect(shopAutoDispatchApi.update).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, strategy: "balanced" }));
  expect(toggle?.getAttribute("aria-checked")).toBe("true");
});

it("keeps the prior state when saving the switch fails", async () => {
  vi.mocked(shopAutoDispatchApi.update).mockRejectedValueOnce(new Error("network"));
  await act(async () => root.render(<MemoryRouter><AutoDispatchEntryButton /></MemoryRouter>));
  const toggle = container.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="开启自动派单"]');
  await act(async () => toggle?.click());
  expect(toggle?.getAttribute("aria-checked")).toBe("false");
  expect(container.querySelector('[role="status"]')?.textContent).toContain("保存失败");
});
