// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/I18nProvider";
import { translateText, type Language } from "../../../i18n/translations";
import type { Technician } from "../../../types/domain";
import {
  cancelDispatchCycle,
  closeDispatchFeedback,
  createDispatchCycleDraft,
  finalizeDispatchCycle,
  getDispatchCycleList,
  launchDispatchCycle,
  resetDispatchCenterStore,
  runDispatchAutoConfirm,
  saveDispatchCycleDraft
} from "../../dispatch-center/store";
import { AutomationWizard } from "./AutomationWizard";

const scheduleStyles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

const dispatchApi = vi.hoisted(() => ({
  cancelCycle: vi.fn(),
  closeFeedback: vi.fn(),
  createCycleDraft: vi.fn(),
  finalizeCycle: vi.fn(),
  launchCycle: vi.fn(),
  listCycles: vi.fn(),
  runAutoConfirm: vi.fn(),
  saveCycleDraft: vi.fn()
}));

vi.mock("../../dispatch-center/api", () => ({
  createDispatchCenterApi: () => dispatchApi
}));

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
    id: "1",
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
  id: String(index + 1),
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-20T10:00:00+09:00"));
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
    feedbackDeadline: mode === "STORE_ASSIGN_FINAL" ? "2026-04-27T18:00:00+09:00" : null
  });
  launchDispatchCycle(next.id, "store-1");
}

describe("merchant schedule planning home", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    window.localStorage.clear();
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    window.scrollTo = vi.fn();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    resetDispatchCenterStore();
    dispatchApi.listCycles.mockImplementation(async (storeId: string) => {
      const list = getDispatchCycleList(storeId);
      return { list, total: list.length, page: 1, page_size: 20 };
    });
    dispatchApi.createCycleDraft.mockImplementation(async (storeId: string, targetTechnicianIds: string[]) =>
      createDispatchCycleDraft(storeId, targetTechnicianIds));
    dispatchApi.saveCycleDraft.mockImplementation(async (cycle) => {
      const result = saveDispatchCycleDraft(cycle);
      if (!result.ok) throw new Error(result.message);
      return getDispatchCycleList(cycle.storeId).find((item) => item.id === cycle.id) as typeof cycle;
    });
    dispatchApi.launchCycle.mockImplementation(async (cycleId: string) => {
      const cycle = [...getDispatchCycleList("store-1"), ...getDispatchCycleList("another-store")]
        .find((item) => item.id === cycleId);
      if (!cycle) throw new Error("cycle missing");
      const result = launchDispatchCycle(cycleId, cycle.storeId);
      if (!result.ok || !result.cycle) throw new Error(result.message);
      return result.cycle;
    });
    dispatchApi.closeFeedback.mockImplementation(async (cycleId: string) => {
      const result = closeDispatchFeedback(cycleId, "store-1");
      if (!result.ok || !result.cycle) throw new Error(result.message);
      return result.cycle;
    });
    dispatchApi.runAutoConfirm.mockImplementation(async (cycleId: string) => {
      const result = runDispatchAutoConfirm(cycleId, "store-1");
      const cycle = getDispatchCycleList("store-1").find((item) => item.id === cycleId);
      if (!result.ok || !cycle || !result.summary) throw new Error(result.message);
      return { cycle, summary: result.summary };
    });
    dispatchApi.finalizeCycle.mockImplementation(async (cycleId: string) => {
      const result = finalizeDispatchCycle(cycleId, "store-1");
      if (!result.ok || !result.cycle) throw new Error(result.message);
      return result.cycle;
    });
    dispatchApi.cancelCycle.mockImplementation(async (cycleId: string) => {
      const cycle = getDispatchCycleList("store-1").find((item) => item.id === cycleId);
      if (!cycle) throw new Error("cycle missing");
      const result = cancelDispatchCycle(cycleId, "store-1");
      if (!result.ok) throw new Error(result.message);
      return { ...cycle, status: "cancelled" as const };
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
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
      await Promise.resolve();
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

  it("renders a directional ordered stepper with distinct progress semantics", async () => {
    await renderWizard();
    await act(async () => button("新建周期")?.click());

    const progress = container.querySelector<HTMLElement>('[data-schedule-stepper="true"]');
    const steps = [...(progress?.querySelectorAll<HTMLElement>("li") ?? [])];

    expect(progress?.tagName).toBe("NAV");
    expect(progress?.getAttribute("aria-label")).toBe("排班步骤");
    expect(progress?.querySelector("ol")).not.toBeNull();
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.dataset.state)).toEqual(["current", "upcoming", "upcoming"]);
    expect(steps.map((step) => step.getAttribute("aria-current"))).toEqual(["step", null, null]);

    await act(async () => button("技师自主排班")?.click());
    await act(async () => button("下一步：规则设定")?.click());

    const updatedSteps = [...container.querySelectorAll<HTMLElement>('[data-schedule-stepper="true"] li')];
    expect(updatedSteps.map((step) => step.dataset.state)).toEqual(["complete", "current", "upcoming"]);
    expect(updatedSteps.map((step) => step.getAttribute("aria-current"))).toEqual([null, "step", null]);
  });

  it("keeps the chevron track compact and safe for translated labels", () => {
    expect(scheduleStyles).toMatch(/\.schedule-stepper-track\s*\{[^}]*display:\s*grid;/s);
    expect(scheduleStyles).toMatch(/grid-template-columns:\s*repeat\(var\(--schedule-step-count\),\s*minmax\(0,\s*1fr\)\)/);
    expect(scheduleStyles).toMatch(/\.schedule-stepper-step\s*\{[^}]*clip-path:\s*polygon/s);
    expect(scheduleStyles).toMatch(/\.schedule-stepper-label\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("provides concise stepper copy in every supported language", () => {
    const sources = ["排班步骤", "模式选择", "规则设定", "技师反馈", "最终确认", "已完成", "当前步骤", "未开始"];
    const expected: Record<Language, string[]> = {
      zh: ["排班步骤", "模式选择", "规则设定", "技师反馈", "最终确认", "已完成", "当前步骤", "未开始"],
      "zh-Hant": ["排班步驟", "模式選擇", "規則設定", "技師回饋", "最終確認", "已完成", "目前步驟", "未開始"],
      ja: ["シフト作成ステップ", "モード選択", "ルール設定", "スタッフ回答", "最終確認", "完了", "現在のステップ", "未開始"],
      en: ["Scheduling steps", "Mode selection", "Rule settings", "Staff feedback", "Final Confirmation", "Completed", "Current step", "Not started"],
      ko: ["근무표 단계", "모드 선택", "규칙 설정", "스태프 피드백", "최종 확인", "완료됨", "현재 단계", "시작 전"]
    };

    (Object.keys(expected) as Language[]).forEach((language) => {
      expect(sources.map((source) => translateText(source, language))).toEqual(expected[language]);
    });
  });

  it("keeps the merchant direct scheduling feedback step and controls", async () => {
    prepareNextCycle("STORE_ASSIGN_FINAL");
    await renderWizard();

    expect(container.textContent).toContain("商户直接排班");
    expect(container.textContent).toContain("技师反馈");
    expect(container.textContent).toContain("反馈截止：2026年4月27日 18:00");
    expect(button("提前结束收集")).toBeDefined();

    await act(async () => button("下一周期确认")?.click());
    expect(container.textContent).toContain("服务端周期班次");

    await act(async () => button("返回排班首页")?.click());
    await act(async () => button("新建周期")?.click());

    expect(container.textContent).toContain("新建周期");
    expect(container.textContent).toContain("模式选择");
    expect(button("下一周期")).toBeUndefined();
  });

  it("offers both scheduling modes and restores the direct-mode feedback deadline", async () => {
    await renderWizard(formalTechnicians);

    await act(async () => button("新建周期")?.click());
    expect(button("技师自主排班")).toBeDefined();
    expect(button("商户直接排班")).toBeDefined();

    await act(async () => button("商户直接排班")?.click());
    await act(async () => button("下一步：规则设定")?.click());

    expect(container.textContent).toContain("技师反馈截止");
    expect(container.querySelector<HTMLInputElement>('input[type="datetime-local"]')).not.toBeNull();
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

  it("creates and confirms this input without reopening either expired draft", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    const historicalIds = ["2026-04-27", "2026-05-27"].map((start, index) => {
      const old = createDispatchCycleDraft("store-1", ["former-tech"]);
      saveDispatchCycleDraft({ ...old, name: `旧草稿${index}`, periodStart: start,
        periodEnd: index === 0 ? "2026-05-26" : "2026-06-25", currentStep: 2 });
      return old.id;
    });
    const before = getDispatchCycleList("store-1");
    await renderWizard(formalTechnicians);
    await act(async () => button("新建周期")?.click());
    expect(button("下一步：规则设定")).toBeDefined();
    await act(async () => button("下一步：规则设定")?.click());
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
    for (const [input, value] of inputs.slice(0, 3).map((input, i) => [input,
      ["本次三个月周期", "2026-09-20", "2026-12-20"][i]] as const)) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
    await act(async () => button("下一步")?.click());
    await act(async () => button("下一步")?.click());
    await act(async () => button("全选")?.click());
    for (let index = 0; index < 6; index += 1) {
      await act(async () => button("下一步")?.click());
    }
    await act(async () => { createDispatchCycleDraft("another-store"); });
    await act(async () => button("发起")?.click());

    expect(container.textContent).toContain("2026年9月20日~2026年12月20日");
    expect(container.textContent).toContain("本次三个月周期");
    const created = getDispatchCycleList("store-1").find((cycle) => !historicalIds.includes(cycle.id));
    expect(created).toMatchObject({ name: "本次三个月周期", periodStart: "2026-09-20",
      periodEnd: "2026-12-20", currentStep: 3, status: "final_confirming",
      targetTechnicianIds: formalTechnicians.map((tech) => tech.id) });
    expect(created?.templateMatrix.every((row) => row.every(Boolean))).toBe(true);
    expect(getDispatchCycleList("store-1").filter((cycle) => historicalIds.includes(cycle.id))).toEqual(before);
    await act(async () => button("删除周期")?.click());
    expect(container.textContent).not.toContain("旧草稿");
    await act(async () => button("新建周期")?.click());
    expect(button("下一步：规则设定")).toBeDefined();
    vi.useRealTimers();
  });

  it("keeps unsaved period inputs when another cycle updates the shared store", async () => {
    await renderWizard(formalTechnicians);
    await act(async () => button("新建周期")?.click());
    await act(async () => button("下一步：规则设定")?.click());
    const end = container.querySelectorAll<HTMLInputElement>('input[type="date"]')[1];
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(end, "2026-12-20");
      end.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { createDispatchCycleDraft("another-store"); });
    expect(end.value).toBe("2026-12-20");
  });

  it("continues the only current draft after returning to the planning home", async () => {
    await renderWizard(formalTechnicians);
    await act(async () => button("新建周期")?.click());
    await act(async () => button("下一步：规则设定")?.click());
    const [created] = getDispatchCycleList("store-1");
    await act(async () => button("返回排班首页")?.click());
    await act(async () => button("新建周期")?.click());
    expect(getDispatchCycleList("store-1").map((cycle) => cycle.id)).toEqual([created.id]);
    expect(container.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("does not let an expired active cycle and expired drafts block creation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00+09:00"));
    for (const status of ["active", "draft", "rule_setting"] as const) {
      const old = createDispatchCycleDraft("store-1", ["former-tech"]);
      saveDispatchCycleDraft({ ...old, status, periodStart: "2026-04-14", periodEnd: "2026-05-26" });
    }
    await renderWizard(formalTechnicians);
    expect(button("新建周期")?.disabled).toBe(false);
    await act(async () => button("新建周期")?.click());
    expect(button("下一步：规则设定")).toBeDefined();
  });

  it("preserves persisted technician choices when a storage refresh arrives before entities load", async () => {
    const chosen = formalTechnicians.map((tech) => tech.id);
    const selected = createDispatchCycleDraft("store-1", chosen);
    const empty = createDispatchCycleDraft("another-store", []);
    await act(async () => {
      window.dispatchEvent(new StorageEvent("storage", {
        key: "needo.dispatch-center.formal-state.v1",
        storageArea: window.localStorage
      }));
    });
    expect(getDispatchCycleList("store-1").find((cycle) => cycle.id === selected.id)?.targetTechnicianIds).toEqual(chosen);
    expect(getDispatchCycleList("another-store").find((cycle) => cycle.id === empty.id)?.targetTechnicianIds).toEqual([]);
    expect(launchDispatchCycle(empty.id, "another-store").ok).toBe(false);
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
