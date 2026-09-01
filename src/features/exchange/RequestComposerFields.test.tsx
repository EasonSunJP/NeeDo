// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestPublicationContext, publishExchangePost } from "./api";
import { ExchangeComposer } from "./ExchangeComposer";

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

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickAction(action: "composer-next") {
  const button = document.body.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`missing ${action}`);
  button.click();
}

function fillValidRequestDraft() {
  const values = {
    title: "需要三位技师提供服务",
    detail: "请按指定时间到达并通过平台联系。",
    serviceStartDate: "2026-09-02",
    serviceStartTime: "13:00",
    serviceEndDate: "2026-09-02",
    serviceEndTime: "16:00",
    expiresDate: "2026-09-02",
    expiresTime: "16:00",
    targetProviderCount: "3",
    budgetMinJpy: "15000",
    budgetMaxJpy: "30000",
    addressLine1: "東京都港区六本木",
    addressLine2: "3-2-1",
    addressLine3: "Room 1201"
  };
  Object.entries(values).forEach(([name, value]) => {
    const input = document.body.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    authHasPermission.mockReturnValue(false);
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
    expect(document.body.textContent).toContain("预算上限 *");
    expect(document.body.textContent).toContain("服务方式 *");
    expect(document.body.querySelector('[name="addressLine1Public"]')).toBeNull();

    fillValidRequestDraft();
    await act(async () => clickAction("composer-next"));

    const review = document.body.querySelector('[data-testid="exchange-publication-review"]');
    expect(review?.textContent).toContain("需要三位技师提供服务");
    expect(review?.textContent).toContain("简体中文");
    expect(review?.textContent).toContain("1,000 Test NDP");
    expect(publishExchangePost).not.toHaveBeenCalled();
  });

  it("clears visibility when an optional address is emptied", async () => {
    await renderAndOpen();
    await waitFor(() => expect(document.body.querySelector('[name="addressLine2"]')).not.toBeNull());
    const address = document.body.querySelector<HTMLInputElement>('[name="addressLine2"]')!;
    const visible = document.body.querySelector<HTMLInputElement>('[name="addressLine2Public"]')!;

    await act(async () => setInputValue(address, "Room 1201"));
    await act(async () => visible.click());
    expect(visible.checked).toBe(true);

    await act(async () => setInputValue(address, ""));
    expect(visible.disabled).toBe(true);
    expect(visible.checked).toBe(false);
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
    fillValidRequestDraft();
    const minimum = document.body.querySelector<HTMLInputElement>('[name="budgetMinJpy"]')!;
    const line2Visible = document.body.querySelector<HTMLInputElement>('[name="addressLine2Public"]')!;
    const selective = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "选配");
    const perProvider = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "单价");
    const home = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button[role="radio"]')).find((button) => button.textContent === "上门");
    if (!selective || !perProvider || !home) throw new Error("missing Request mode controls");

    await act(async () => setInputValue(minimum, ""));
    await act(async () => selective.click());
    await act(async () => perProvider.click());
    await act(async () => home.click());
    await act(async () => line2Visible.click());
    await act(async () => clickAction("composer-next"));

    expect(document.body.textContent).toContain("选配");
    expect(document.body.textContent).toContain("单价");
    expect(document.body.textContent).toContain("上门");
    expect(document.body.textContent).toContain("3-2-1 · 匹配前可见");
    expect(document.body.textContent).toContain("¥30,000");
    expect(publishExchangePost).not.toHaveBeenCalled();
  });
});
