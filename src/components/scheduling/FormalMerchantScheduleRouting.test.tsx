// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n/I18nProvider";
import { ScheduleCycleCalendarBoard } from "./ScheduleCycleCalendarBoard";
import {
  buildFormalMerchantScheduleBoard,
  getFormalMerchantScheduleCycleRange
} from "./formalMerchantScheduleBoard";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}</output>;
}

describe("formal merchant schedule staff routing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn() });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("routes multiple employee rows to public NeeDo ids and leaves a missing public id non-clickable", async () => {
    const dateKey = "2026-09-02";
    const board = buildFormalMerchantScheduleBoard({
      dateKey,
      range: getFormalMerchantScheduleCycleRange(dateKey),
      shop: { cover: "", id: "16", name: "LifeDance" },
      slots: [],
      technicians: [
        { avatar: "", internalProfileId: "22", name: "佐藤 美咲", publicNeedoId: "s5148317836" },
        { avatar: "", internalProfileId: "23", name: "高桥 莉子", publicNeedoId: "s6259428947" },
        { avatar: "", internalProfileId: "24", name: "公开标识待补", publicNeedoId: null }
      ]
    });

    await act(async () => root.render(
      <MemoryRouter initialEntries={["/merchant/schedule"]}>
        <I18nProvider>
          <ScheduleCycleCalendarBoard
            dataOverride={board.dataOverride}
            dateKey={dateKey}
            getTechnicianDetailPath={(internalId) => `/merchant/staff/${internalId}`}
            onDateChange={vi.fn()}
            onOpenCell={vi.fn()}
            onViewChange={vi.fn()}
            storeId="16"
            view="week"
          />
          <LocationProbe />
        </I18nProvider>
      </MemoryRouter>
    ));

    const publicLinks = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/merchant/staff/"]'));
    expect(publicLinks.map((link) => link.getAttribute("href"))).toEqual([
      "/merchant/staff/s5148317836",
      "/merchant/staff/s6259428947"
    ]);
    expect(container.querySelector('a[href="/merchant/staff/22"]')).toBeNull();
    expect(container.querySelector('a[href="/merchant/staff/24"]')).toBeNull();

    await act(async () => publicLinks[0]?.click());
    expect(container.querySelector('[data-testid="location-probe"]')?.textContent).toBe(
      "/merchant/staff/s5148317836"
    );
  });
});
