// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { Technician } from "../../../types/domain";
import {
  closeDispatchFeedback,
  createDispatchCycleDraft,
  finalizeDispatchCycle,
  launchDispatchCycle,
  resetDispatchCenterStore,
  saveDispatchCycleDraft
} from "../../dispatch-center/store";
import { AutomationWizard } from "./AutomationWizard";

vi.mock("../../../components/scheduling/ScheduleCycleBoard", () => ({
  ScheduleCycleBoard: ({ drawerTitle }: { drawerTitle: string }) => (
    <div data-testid="schedule-cycle-board">{drawerTitle}</div>
  )
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const technicians: Technician[] = [
  {
    acceptRate: 98,
    avatar: "/technician-one.png",
    cancelRate: 1,
    id: "tech-1",
    income: 0,
    languages: ["日语"],
    name: "技师一",
    orderCount: 20,
    rating: 4.9,
    reviewCount: 18,
    role: "therapist",
    serviceAreas: ["东京"],
    skills: ["护理"],
    status: "available",
    storeId: "store-1",
    systemId: "s0000000001"
  }
];

function prepareNextCycle(mode: "TECH_SELF_FINAL" | "STORE_ASSIGN_FINAL") {
  const current = createDispatchCycleDraft("store-1");
  saveDispatchCycleDraft({
    ...current,
    mode: "STORE_ASSIGN_FINAL",
    currentStep: 2,
    periodStart: "2026-04-14",
    periodEnd: "2026-04-27"
  });
  launchDispatchCycle(current.id, "store-1");
  closeDispatchFeedback(current.id, "store-1");
  finalizeDispatchCycle(current.id, "store-1");

  const next = createDispatchCycleDraft("store-1");
  saveDispatchCycleDraft({
    ...next,
    mode,
    currentStep: 2,
    periodStart: "2026-04-28",
    periodEnd: "2026-05-27",
    feedbackDeadline: "2026-04-24T18:00:00+09:00"
  });
  launchDispatchCycle(next.id, "store-1");
}

describe("merchant schedule planning home", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    resetDispatchCenterStore();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const renderWizard = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <AutomationWizard
              operatorId="store-1"
              storeId="store-1"
              surface="mobile"
              technicians={technicians}
            />
          </I18nProvider>
        </MemoryRouter>
      );
    });
  };

  const button = (label: string) => (
    container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    ?? [...container.querySelectorAll("button")]
      .find((item) => item.textContent?.trim() === label)
  ) as HTMLButtonElement | undefined;

  it("shows the next-cycle lifecycle and technician self-scheduling completion meaning", async () => {
    prepareNextCycle("TECH_SELF_FINAL");
    await renderWizard();

    expect(container.textContent).toContain("下一周期 2026年4月28日 ～ 2026年5月27日");
    ["模式选择", "规则设定", "技师反馈", "最终确认"].forEach((label) => {
      expect(container.textContent).toContain(label);
    });
    expect(container.textContent).toContain("收集反馈中");
    expect(container.textContent).toContain("技师自主排班");
    expect(container.textContent).toContain("技师直接完成自己的下一周期排班");
    expect(container.textContent).toContain("2026年4月24日 18:00");
    ["已提交", "已更新", "未反馈", "异常数量"].forEach((label) => {
      expect(button(label)).toBeDefined();
    });
    expect(button("下一周期确认")).toBeDefined();
    expect(button("新建周期")).toBeDefined();

    await act(async () => button("未反馈")?.click());
    expect(button("未反馈")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("技师一");
    expect(container.textContent).toContain("未完成下一周期排班");

    await act(async () => button("提醒未反馈")?.click());
    expect(container.textContent).toContain("已提醒未反馈技师。");
    expect(button("已发送提醒")?.disabled).toBe(true);

    await act(async () => button("提前结束收集")?.click());
    expect(container.textContent).toContain("确认提前结束反馈收集？");
    await act(async () => button("确认结束")?.click());
    expect(container.textContent).toContain("已提前结束反馈并进入最终确认。");
    expect(button("提前结束收集")?.disabled).toBe(true);
  });

  it("opens the existing board and enters a builder without the duplicate next-cycle card", async () => {
    prepareNextCycle("STORE_ASSIGN_FINAL");
    await renderWizard();

    expect(container.textContent).toContain("技师确认店铺排班，或提交请假与调整信息");

    await act(async () => button("下一周期确认")?.click());
    expect(container.querySelector('[data-testid="schedule-cycle-board"]')?.textContent)
      .toBe("下一周期排班表");

    await act(async () => button("返回排班首页")?.click());
    await act(async () => button("新建周期")?.click());

    expect(container.textContent).toContain("新建周期");
    expect(container.textContent).toContain("模式选择");
    expect(button("下一周期")).toBeUndefined();
  });

  it("keeps the new-cycle action available when it continues an existing builder at the cycle limit", async () => {
    prepareNextCycle("TECH_SELF_FINAL");
    const builder = createDispatchCycleDraft("store-1");
    await renderWizard();

    expect(button("新建周期")?.disabled).toBe(false);
    await act(async () => button("新建周期")?.click());
    expect(container.textContent).toContain(builder.name);
    expect(button("下一周期")).toBeUndefined();
  });
});
