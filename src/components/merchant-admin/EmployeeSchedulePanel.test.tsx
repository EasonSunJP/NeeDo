// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantEmployee } from "../../features/merchant-admin/employeeApi";
import { merchantEmployeeApi } from "../../features/merchant-admin/employeeApi";
import {
  createEmployeeScheduleCalendarData,
  EmployeeSchedulePanel,
} from "./EmployeeSchedulePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../i18n/I18nProvider", () => ({
  useOptionalI18n: () => ({ language: "zh", setLanguage: vi.fn() }),
}));

vi.mock("../../features/merchant-admin/employeeApi", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("../../features/merchant-admin/employeeApi")
  >();
  return {
    ...original,
    merchantEmployeeApi: { ...original.merchantEmployeeApi, schedule: vi.fn() },
  };
});

vi.mock("../scheduling/ScheduleCycleCalendarBoard", () => ({
  ScheduleCycleCalendarBoard: ({
    dataOverride,
    onViewChange,
    surface,
  }: {
    dataOverride: {
      events: Array<{ id: string; title: string }>;
      cellByEventId: Map<
        string,
        { isClickable?: boolean; privacyVisibility?: string }
      >;
    };
    onViewChange: (view: string) => void;
    surface: "desktop" | "mobile";
  }) => (
    <div data-surface={surface} data-testid="shared-schedule-board">
      {dataOverride.events.map((event) => {
        const cell = dataOverride.cellByEventId.get(event.id);
        return (
          <span
            data-clickable={String(cell?.isClickable ?? false)}
            data-employee-schedule-visibility={cell?.privacyVisibility}
            key={event.id}
          >
            {event.title}
          </span>
        );
      })}
      <button onClick={() => onViewChange("month")} type="button">
        月
      </button>
    </div>
  ),
}));

const employee = {
  needoId: "s0000000047",
  displayName: "斉藤 健太",
  avatarUrl: "/avatar.png",
  affiliation: {
    relationshipType: "partner",
    workStatus: "active",
    shop: { id: 16, publicId: "shop0000000016", name: "麻布十番超级按摩" },
  },
} as MerchantEmployee;

const projection = {
  employee: {
    needoId: employee.needoId,
    displayName: employee.displayName,
    avatarUrl: employee.avatarUrl,
    relationshipType: "partner" as const,
    workStatus: "active" as const,
  },
  range: {
    from: "2026-08-24T15:00:00.000Z",
    to: "2026-08-31T15:00:00.000Z",
    view: "week" as const,
  },
  events: [
    {
      projectionId:
        "busy-redacted:2026-08-29T13:00:00.000Z:2026-08-29T15:00:00.000Z",
      kind: "busy_redacted" as const,
      visibility: "busy_redacted" as const,
      status: "busy" as const,
      startsAt: "2026-08-29T13:00:00.000Z",
      endsAt: "2026-08-29T15:00:00.000Z",
      title: "其他店铺已有确认安排" as const,
      isClickable: false as const,
      isEditable: false as const,
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("EmployeeSchedulePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(merchantEmployeeApi.schedule).mockResolvedValue(projection);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("reuses the shared board and keeps cross-shop confirmed time generic and non-clickable", async () => {
    await act(async () => root.render(<EmployeeSchedulePanel employee={employee} scheduleSurface="mobile" />));
    await flush();

    expect(container.querySelector('[data-testid="shared-schedule-board"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="shared-schedule-board"]')?.getAttribute("data-surface")).toBe("mobile");
    expect(container.textContent).toContain("其他店铺已有确认安排");
    expect(container.textContent).not.toMatch(/客户|服务|订单|金额|店铺名称/);
    expect(
      container.querySelector('[data-employee-schedule-visibility="busy_redacted"]'),
    ).not.toBeNull();
  });

  it("maps technician and current-shop availability into shared source-labelled strips", () => {
    const data = createEmployeeScheduleCalendarData(
      {
        ...projection,
        events: [
          {
            projectionId: "availability:2026-09-10T01:00:00.000Z:2026-09-10T02:00:00.000Z",
            kind: "availability",
            visibility: "affiliated_shops",
            status: "available",
            startsAt: "2026-09-10T01:00:00.000Z",
            endsAt: "2026-09-10T02:00:00.000Z",
            title: "合作技师可排班",
            isClickable: false,
            isEditable: false,
          },
          {
            projectionId: "schedule:81",
            kind: "schedule",
            visibility: "current_shop",
            status: "available",
            startsAt: "2026-09-10T05:00:00.000Z",
            endsAt: "2026-09-10T06:00:00.000Z",
            title: "可排班",
            detail: "本店排班",
            isClickable: false,
            isEditable: true,
          },
        ],
      },
      employee,
      ["2026-09-10"],
    );

    expect(data.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringMatching(/^availability:/),
        availabilitySourceType: "technician",
        calendarLabel: "自由排班",
        badge: "可排班",
      }),
      expect.objectContaining({
        id: "schedule:81",
        availabilitySourceType: "shop",
        calendarLabel: "麻布十番超级按摩",
        badge: "可排班",
      }),
    ]));
  });

  it("shows a retry state and reloads the visible window", async () => {
    vi.mocked(merchantEmployeeApi.schedule)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(projection);
    await act(async () => root.render(<EmployeeSchedulePanel employee={employee} />));
    await flush();

    expect(container.textContent).toContain("员工日程加载失败");
    const retry = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "重试",
    );
    expect(retry).toBeDefined();
    await act(async () => retry?.click());
    await flush();
    expect(merchantEmployeeApi.schedule).toHaveBeenCalledTimes(2);
  });

  it("reloads formal data when the shared board changes to month view", async () => {
    await act(async () => root.render(<EmployeeSchedulePanel employee={employee} />));
    await flush();
    const month = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "月",
    );
    await act(async () => month?.click());
    await flush();

    expect(merchantEmployeeApi.schedule).toHaveBeenLastCalledWith(
      employee.needoId,
      expect.objectContaining({ view: "month" }),
    );
  });
});
