// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendarProps: vi.fn()
}));

vi.mock("../../components/scheduling/UnifiedUserCalendar", () => ({
  UnifiedUserCalendar: (props: Record<string, unknown>) => {
    mocks.calendarProps(props);
    return <div data-testid="shared-unified-calendar">共享正式日程</div>;
  }
}));
vi.mock("../../components/technician/FormalTechnicianOrdersPanel", () => ({
  FormalTechnicianOrdersPanel: () => <div data-testid="formal-order-panel">订单正式面板</div>
}));

import { FormalTechnicianScheduleWorkspace } from "./FormalTechnicianScheduleWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => Promise.resolve());
    }
  }
  throw lastError;
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  await act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("FormalTechnicianScheduleWorkspace", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T09:00:00+09:00"));
    mocks.calendarProps.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          profileAvatarUrl="/media/technician.jpg"
          profileId={31}
          profileName="正式技师"
          shopId={11}
          shopName="正式店铺"
        />
      </MemoryRouter>
    ));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("renders the shared formal parallel calendar and keeps order settings available", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="shared-unified-calendar"]')).not.toBeNull());
    expect(mocks.calendarProps).toHaveBeenLastCalledWith(expect.objectContaining({
      displayMode: "parallel",
      formalOnly: true,
      scope: "technician",
      searchQuery: "",
      showSourceDrawer: true,
      currentTechnician: {
        avatar: "/media/technician.jpg",
        id: "31",
        name: "正式技师",
        storeId: "11"
      }
    }));

    await click("排班设置");
    expect(container.querySelector('[data-testid="formal-order-panel"]')).not.toBeNull();
  });

  it("forwards the formal schedule search to the shared calendar", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="shared-unified-calendar"]')).not.toBeNull());
    expect(container.textContent).toContain("我的排班");
    expect(container.textContent).toContain("排班设置");
    const search = container.querySelector<HTMLInputElement>('input[aria-label="行程搜索"]');
    expect(search?.placeholder).toBe("行程搜索");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(search, "预约");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(mocks.calendarProps).toHaveBeenLastCalledWith(expect.objectContaining({ searchQuery: "预约" }));
  });
});
