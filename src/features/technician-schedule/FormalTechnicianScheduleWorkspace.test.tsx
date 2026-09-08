// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calendarProps: vi.fn(),
  timelineProps: vi.fn()
}));

vi.mock("../../components/client-ui/AppScaffold", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../components/client-ui/AppScaffold")>();
  return {
    ...actual,
    FeatureSegmentedTabs: ({
      items,
      onChange
    }: {
      items: Array<{ label: string; value: "calendar" | "settings" }>;
      onChange: (value: "calendar" | "settings") => void;
    }) => (
      <div>
        {items.map((item) => (
          <button key={item.value} onClick={() => onChange(item.value)} type="button">{item.label}</button>
        ))}
      </div>
    )
  };
});

vi.mock("../../components/scheduling/UnifiedUserCalendar", () => ({
  UnifiedUserCalendar: (props: Record<string, unknown>) => {
    mocks.calendarProps(props);
    return <div data-testid="shared-unified-calendar">共享正式日程</div>;
  }
}));
vi.mock("../../components/technician/FormalTechnicianOrdersPanel", () => ({
  FormalTechnicianOrdersPanel: () => <div data-testid="formal-order-panel">订单正式面板</div>
}));
vi.mock("../../components/mobile/ContactEventTimeline", () => ({
  ContactEventTimelinePanel: (props: Record<string, unknown>) => {
    mocks.timelineProps(props);
    return <div data-testid="formal-status-timeline">状态记录</div>;
  }
}));
vi.mock("../../components/mobile/FloatingHomeHeader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../components/mobile/FloatingHomeHeader")>();
  return {
    ...actual,
    FloatingHomeHeader: ({ children }: { children: React.ReactNode }) => (
      <header data-testid="formal-schedule-floating-header">{children}</header>
    )
  };
});
vi.mock("../../features/scheduling/window-loader", () => ({
  loadEveryTechnicianOrder: vi.fn().mockResolvedValue([])
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

describe("FormalTechnicianScheduleWorkspace", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T09:00:00+09:00"));
    mocks.calendarProps.mockClear();
    mocks.timelineProps.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          dataCenterPeriod="last7days"
          initialSelectedDate="2026-08-26"
          profileAvatarUrl="/media/technician.jpg"
          profileId={31}
          profileName="正式技师"
          shopId={11}
          shopName="正式店铺"
          tab="calendar"
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
      initialSelectedDate: "2026-08-26",
      currentTechnician: {
        avatar: "/media/technician.jpg",
        id: "31",
        name: "正式技师",
        storeId: "11"
      }
    }));
    expect(container.textContent).toContain("数据中心期间：近7天");

    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          dataCenterPeriod="last7days"
          initialSelectedDate="2026-08-26"
          profileAvatarUrl="/media/technician.jpg"
          profileId={31}
          profileName="正式技师"
          shopId={11}
          shopName="正式店铺"
          tab="settings"
        />
      </MemoryRouter>
    ));
    expect(container.querySelector('[data-testid="formal-order-panel"]')).not.toBeNull();
  });

  it("forwards the formal schedule search to the shared calendar", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="shared-unified-calendar"]')).not.toBeNull());
    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          dataCenterPeriod="last7days"
          initialSelectedDate="2026-08-26"
          profileAvatarUrl="/media/technician.jpg"
          profileId={31}
          profileName="正式技师"
          searchQuery="预约"
          shopId={11}
          shopName="正式店铺"
          tab="calendar"
        />
      </MemoryRouter>
    ));
    expect(mocks.calendarProps).toHaveBeenLastCalledWith(expect.objectContaining({ searchQuery: "预约" }));
  });

  it("keeps the approved three-column formal status timeline below the shared calendar", async () => {
    await waitFor(() => expect(container.querySelector('[data-testid="formal-status-timeline"]')).not.toBeNull());
    expect(mocks.timelineProps).toHaveBeenLastCalledWith(expect.objectContaining({
      commentAuthorAvatarSrc: "/media/technician.jpg",
      commentAuthorName: "正式技师",
      emptyLabel: "暂无执行 / 异常记录",
      layout: "three-column",
      title: "状态记录"
    }));
  });

  it("keeps an independent technician's formal calendar visible without exposing shop-required creation", async () => {
    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          profileAvatarUrl={null}
          profileId={31}
          profileName="独立技师"
          shopId={null}
          shopName="独立技师"
          tab="calendar"
        />
      </MemoryRouter>
    ));

    expect(mocks.calendarProps).toHaveBeenLastCalledWith(expect.objectContaining({
      currentTechnician: expect.objectContaining({ id: "31", storeId: "" }),
      formalOnly: true,
      scope: "technician"
    }));
    expect(container.querySelector('button[aria-label="新建正式排班"]')).toBeNull();

    await act(async () => root.render(
      <MemoryRouter>
        <FormalTechnicianScheduleWorkspace
          profileAvatarUrl={null}
          profileId={31}
          profileName="独立技师"
          shopId={null}
          shopName="独立技师"
          tab="settings"
        />
      </MemoryRouter>
    ));
    expect(container.textContent).toContain("可查看当前技师的正式日程；创建可预约时段需要先关联店铺。");
    expect(container.textContent).not.toContain("新建正式排班");
  });
});
