// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import type { Technician } from "../../../types/domain";
import {
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

const formalTechnicians: Technician[] = Array.from({ length: 26 }, (_, index) => ({
  acceptRate: 95,
  avatar: `/formal-technician-${index + 1}.png`,
  cancelRate: 1,
  id: `formal-tech-${index + 1}`,
  income: 0,
  languages: ["日语"],
  name: `正式技师${index + 1}`,
  orderCount: 20,
  rating: 4.9,
  reviewCount: 18,
  role: "therapist",
  serviceAreas: ["东京"],
  skills: ["护理"],
  status: "available",
  storeId: "store-1",
  systemId: `s${String(index + 1).padStart(10, "0")}`
}));

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
  finalizeDispatchCycle(current.id, "store-1");

  const next = createDispatchCycleDraft("store-1");
  saveDispatchCycleDraft({
    ...next,
    mode,
    currentStep: 2,
    periodStart: "2026-04-28",
    periodEnd: "2026-05-27",
    feedbackDeadline: null
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
    window.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
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

  const renderWizard = async (technicianList = technicians) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <AutomationWizard
              operatorId="store-1"
              storeId="store-1"
              surface="mobile"
              technicians={technicianList}
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

  it("shows the three-step technician self-scheduling lifecycle", async () => {
    prepareNextCycle("TECH_SELF_FINAL");
    await renderWizard();

    expect(container.textContent).toContain("下一周期 2026年4月28日 ～ 2026年5月27日");
    ["模式选择", "规则设定", "最终确认"].forEach((label) => {
      expect(container.textContent).toContain(label);
    });
    expect(container.textContent).toContain("技师自主排班");
    expect(container.textContent).toContain("同周期无法开启其他模式排班");
    expect(container.textContent).not.toContain("技师反馈截止");
    expect(button("下一周期确认")).toBeDefined();
    expect(button("新建周期")).toBeDefined();
  });

  it("opens the existing board and enters a builder without the duplicate next-cycle card", async () => {
    prepareNextCycle("STORE_ASSIGN_FINAL");
    await renderWizard();

    expect(container.textContent).toContain("商户直接排班模式");

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

  it("saves a draft and cancels editing by discarding the new cycle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    await renderWizard(formalTechnicians);

    await act(async () => button("新建周期")?.click());
    await act(async () => button("下一步：规则设定")?.click());

    const dateInputs = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    expect(dateInputs.map((input) => input.value)).toEqual(["2026-09-20", "2026-10-20"]);
    expect(container.textContent).not.toContain("技师反馈截止");

    await act(async () => button("保存草稿")?.click());
    expect(container.textContent).toContain("排班草稿已保存");

    await act(async () => button("取消编辑")?.click());
    expect(container.textContent).toContain("周期已删除，可以重新新建周期");
    expect(container.textContent).toContain("下一周期尚未创建");
    vi.useRealTimers();
  });

  it("uses all formal store technicians as the default targets for a new cycle", async () => {
    await renderWizard(formalTechnicians);

    await act(async () => button("新建周期")?.click());
    await act(async () => button("下一步：规则设定")?.click());

    for (let index = 0; index < 7; index += 1) {
      await act(async () => button("下一步")?.click());
    }

    expect(container.textContent).toContain("26 人");
    expect(container.textContent).toContain("正式技师1");
    expect(container.textContent).toContain("正式技师26");
  });

  it("recomputes holidays and notification preview after the cycle period changes", async () => {
    await renderWizard(formalTechnicians);

    await act(async () => button("新建周期")?.click());
    await act(async () => button("下一步：规则设定")?.click());

    for (let index = 0; index < 9; index += 1) {
      await act(async () => button("下一步")?.click());
    }

    await act(async () => button("预览模板")?.click());
    expect(container.textContent).toContain("2026-09-20");

    for (let index = 0; index < 8; index += 1) {
      await act(async () => button("上一步")?.click());
    }

    const periodInputs = [...container.querySelectorAll<HTMLInputElement>('input[type="date"]')];
    expect(periodInputs).toHaveLength(2);
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(periodInputs[0], "2026-09-21");
      periodInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(periodInputs[1], "2026-10-20");
      periodInputs[1].dispatchEvent(new Event("change", { bubbles: true }));
    });

    for (let index = 0; index < 3; index += 1) {
      await act(async () => button("下一步")?.click());
    }

    expect(container.textContent).toContain("2026-09-21");
    expect(container.textContent).toContain("2026-09-23");
    expect(container.textContent).toContain("2026-10-12");
    expect(container.textContent).not.toContain("2026-04-29");

    for (let index = 0; index < 5; index += 1) {
      await act(async () => button("下一步")?.click());
    }

    expect(container.textContent).toContain("2026-09-21 18:00-20:00");
    expect(container.textContent).not.toContain("2026-04-27 18:00-20:00");
  });
});
