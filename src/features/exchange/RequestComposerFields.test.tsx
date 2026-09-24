// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestPublicationContext, publishExchangePost } from "./api";
import { ExchangeComposer } from "./ExchangeComposer";
import { shopTaxonomyApi } from "../shop-taxonomy/api";

const { authHasPermission } = vi.hoisted(() => ({
  authHasPermission: vi.fn<(permission: string) => boolean>()
}));

vi.mock("../../auth/AuthProvider", () => ({
  useOptionalAuth: () => ({ hasPermission: authHasPermission })
}));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "client-theme-dark-green",
  useClientTheme: () => ({ theme: "dark-green", isNight: true })
}));
vi.mock("./api", () => ({
  getRequestPublicationContext: vi.fn(),
  publishExchangePost: vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = input instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickAction(action: "composer-next") {
  const button = document.body.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`missing ${action}`);
  button.click();
}

async function fillValidRequestDraft() {
  const massageCategory = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[aria-pressed="false"]'))
    .find((button) => button.textContent === "按摩");
  if (!massageCategory) throw new Error("missing Request category");
  await act(async () => massageCategory.click());
  await waitFor(() => expect(document.body.textContent).toContain("上门按摩"));
  await act(async () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[aria-pressed="false"]'))
    .find((button) => button.textContent === "上门按摩")?.click());
  const values = {
    title: "需要三位技师提供服务",
    detail: "请按指定时间到达并通过平台联系。",
    serviceStartDate: "2026-09-02",
    serviceStartTime: "13:00",
    serviceEndDate: "2026-09-02",
    serviceEndTime: "16:00",
    expiresDate: "2026-09-02",
    expiresTime: "12:30",
    targetProviderCount: "3",
    budgetMinJpy: "15000",
    budgetMaxJpy: "30000",
    addressLine1: "東京都港区六本木",
    addressLine2: "3-2-1",
    addressLine3: "Room 1201"
  };
  Object.entries(values).forEach(([name, value]) => {
    const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
    if (!input) throw new Error(`missing ${name}`);
    setInputValue(input, value);
  });
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

describe("RequestComposerFields formal publication contract", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-30T00:00:00.000Z"));
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    authHasPermission.mockReturnValue(false);
    vi.spyOn(shopTaxonomyApi, "listCategories").mockResolvedValue({
      list: [{ id: 1, code: "massage", label: "按摩", qualificationPolicy: "OPEN" }], total: 1, page: 1, page_size: 100
    });
    vi.spyOn(shopTaxonomyApi, "listKeywords").mockResolvedValue({
      list: [{ id: 10, code: "home", categoryId: 1, label: "上门按摩", qualificationPolicy: "OPEN" }], total: 1, page: 1, page_size: 100
    });
    vi.mocked(getRequestPublicationContext).mockResolvedValue({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "gold",
      maxTargetProviderCount: 3,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.querySelectorAll(".client-mobile-fullscreen-page,.client-action-dialog-overlay").forEach((node) => node.remove());
    container.remove();
    vi.restoreAllMocks();
  });

  async function renderAndOpen() {
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    const trigger = container.querySelector<HTMLButtonElement>('[data-action="open-composer"]');
    if (!trigger) throw new Error("missing compose trigger");
    await act(async () => trigger.click());
  }

  it("renders the server cap, required markers, and Request-only fee review", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());

    expect(getRequestPublicationContext).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector<HTMLInputElement>('[name="targetProviderCount"]')?.getAttribute("max")).toBe("3");
    expect(document.body.textContent).toContain("地址1 *");
    expect(document.body.textContent).toContain("预算上限（日元） *");
    expect(document.body.textContent).toContain("服务方式 *");
    expect(document.body.textContent).toContain("服务开始日期 *");
    expect(document.body.textContent).toContain("服务结束时间 *");
    expect(document.body.textContent).toContain("应募有效截止时间 *");
    expect(document.body.textContent).toContain("地址1发布后所有人可见");
    expect(document.body.querySelector<HTMLInputElement>('[name="addressLine1"]')?.placeholder).toBe("例如：东京都新宿区新宿1-1-1");
    expect(document.body.textContent).toContain("地址2（建筑物名、楼层、房间号；仅匹配成功者可见）");
    expect(document.body.querySelector<HTMLInputElement>('[name="addressLine2"]')?.placeholder).toBe("例如：新宿大厦 5楼 501室");
    expect(document.body.textContent).toContain("地址3（可选，仅对应募成功者展示）");
    expect(document.body.querySelector('[name="addressLine1Public"]')).toBeNull();

    await fillValidRequestDraft();
    await act(async () => clickAction("composer-next"));

    const review = document.body.querySelector('[data-testid="exchange-publication-review"]');
    expect(review?.textContent).toContain("需要三位技师提供服务");
    expect(review?.textContent).toContain("简体中文");
    expect(review?.textContent).toContain("1,000 Test NDP");
    expect(publishExchangePost).not.toHaveBeenCalled();
  });

  it("lets the author choose the content language while keeping the post type fixed to Request", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());

    const locale = document.body.querySelector<HTMLElement>('[data-testid="exchange-composer-locale-rail"]');
    expect(locale).not.toBeNull();
    expect(locale?.className).toContain("fixed right-");
    expect(document.body.querySelector('[data-testid="exchange-post-type-selector"]')).toBeNull();

    await act(async () => locale?.querySelector<HTMLButtonElement>('[aria-label="日本語"]')?.click());
    await fillValidRequestDraft();
    await act(async () => clickAction("composer-next"));

    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')?.textContent).toContain("日本語");
  });

  it("treats a language-only change as a dirty draft before closing", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[data-testid="exchange-composer-locale-rail"]')).not.toBeNull());

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-testid="exchange-composer-locale-rail"] [aria-label="日本語"]')?.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click());

    expect(document.body.textContent).toContain("放弃本次编辑？");
    expect(document.body.querySelector('[data-testid="exchange-composer-locale-rail"]')).not.toBeNull();
  });

  it("does not offer pre-match disclosure controls for exact address lines", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="addressLine2"]')).not.toBeNull());
    expect(document.body.querySelector('[name="addressLine2Public"]')).toBeNull();
    expect(document.body.querySelector('[name="addressLine3Public"]')).toBeNull();
    expect(document.body.textContent).toContain("匹配成功后，参与者全员可查看所有已填写地址");
  });

  it("offers half-hour Request time choices and separate matching mode explanations", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="serviceStartTime"]')).not.toBeNull());

    for (const name of ["serviceStartTime", "serviceEndTime", "expiresTime"]) {
      const select = document.body.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
      expect(select).not.toBeNull();
      const options = Array.from(select!.options).map((option) => option.value);
      expect(options).toContain("10:00");
      expect(options).toContain("10:30");
      expect(options).toContain("11:00");
      expect(options).not.toContain("10:45");
    }
    expect(document.body.querySelector('button[aria-label="速配说明"]')).not.toBeNull();
    expect(document.body.querySelector('button[aria-label="选配说明"]')).not.toBeNull();
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="速配说明"]')?.click());
    expect(document.body.textContent).toContain("有效应募达到所需人数且总报价在预算内时自动匹配");
    expect(document.body.querySelector<HTMLButtonElement>('button[role="radio"]')?.getAttribute("aria-checked")).toBe("true");
    await act(async () => document.body.querySelector<HTMLButtonElement>('button[aria-label="选配说明"]')?.click());
    expect(document.body.textContent).toContain("由你查看报价并选择服务者");
    expect(document.body.querySelector<HTMLButtonElement>('button[role="radio"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("offers an unrestricted default and explicit technician gender choices", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[aria-label="指定技师性别"]')).not.toBeNull());
    const group = document.body.querySelector('[role="radiogroup"][aria-label="指定技师性别"]');
    expect(group?.textContent).toContain("不限");
    expect(group?.textContent).toContain("男");
    expect(group?.textContent).toContain("女");
    expect(group?.querySelector('[aria-checked="true"]')?.textContent).toBe("不限");
  });

  it("keeps Next disabled until the server returns publication authority", async () => {
    vi.mocked(getRequestPublicationContext).mockReturnValue(new Promise(() => undefined));
    await renderAndOpen();

    expect(document.body.textContent).toContain("正在读取正式发布条件");
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.disabled).toBe(true);
    expect(document.body.querySelector('[name="targetProviderCount"]')).toBeNull();
  });

  it("keeps a server-denied Request blocked with the reason visible before the fields", async () => {
    vi.mocked(getRequestPublicationContext).mockResolvedValueOnce({
      canPublish: false,
      capacitySource: "customer_membership",
      membershipLevel: "standard",
      maxTargetProviderCount: 1,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
    });
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());

    const alert = document.body.querySelector('[role="alert"]');
    const fields = document.body.querySelector('[data-testid="exchange-request-composer-fields"]');
    expect(alert).not.toBeNull();
    expect(fields).not.toBeNull();
    expect(alert!.textContent).toContain("当前身份不能发布 Request");
    expect(alert!.compareDocumentPosition(fields!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.disabled).toBe(true);
  });

  it("reviews selective per-provider intent with an optional lower bound", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());
    await fillValidRequestDraft();
    const minimum = document.body.querySelector<HTMLInputElement>('[name="budgetMinJpy"]')!;
    const selective = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "选配");
    const perProvider = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "单价");
    const home = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "上门");
    if (!selective || !perProvider || !home) throw new Error("missing Request mode controls");

    await act(async () => setInputValue(minimum, ""));
    await act(async () => selective.click());
    await act(async () => perProvider.click());
    await act(async () => home.click());
    await act(async () => clickAction("composer-next"));

    expect(document.body.textContent).toContain("选配");
    expect(document.body.textContent).toContain("单价");
    expect(document.body.textContent).toContain("上门");
    expect(document.body.textContent).toContain("3-2-1 · 匹配成功后可见");
    expect(document.body.textContent).toContain("¥30,000");
    expect(publishExchangePost).not.toHaveBeenCalled();
  });
});
