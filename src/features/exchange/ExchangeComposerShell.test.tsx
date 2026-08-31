// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishExchangePost } from "./api";
import { ExchangeComposer } from "./ExchangeComposer";
import type { ExchangePost } from "./types";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "client-theme-dark-green",
  useClientTheme: () => ({ theme: "dark-green", isNight: true })
}));
vi.mock("./api", () => ({ publishExchangePost: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const publishedIntelligence: ExchangePost = {
  id: 84,
  type: "intelligence",
  status: "published",
  title: "今晚 22 点后可预约",
  detail: "支持平台内确认后到店或预约。",
  contentLocale: "zh-CN",
  areaLabel: "六本木",
  serviceStartAt: "2026-08-30T13:00:00.000Z",
  serviceEndAt: "2026-08-30T16:00:00.000Z",
  expiresAt: "2026-08-30T16:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: { publicId: "s0000000084", identityType: "technician", displayName: "技师 84", avatarUrl: null },
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: true },
  demand: null,
  intelligence: {
    serviceMode: "store",
    addressLabel: "東京都港区六本木 3-2-1",
    serviceAreas: ["港区"],
    originalPriceJpy: 16000,
    campaignPriceJpy: 12800
  }
};

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickAction(action: "composer-next" | "composer-publish") {
  const button = document.body.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!button) throw new Error(`missing ${action}`);
  button.click();
}

function fillValidIntelligenceDraft() {
  const values = {
    title: "今晚 22 点后可预约",
    detail: "支持平台内确认后到店或预约。",
    areaLabel: "六本木",
    serviceStartDate: "2026-08-30",
    serviceStartTime: "22:00",
    serviceEndDate: "2026-08-31",
    serviceEndTime: "01:00",
    expiresDate: "2026-08-31",
    expiresTime: "01:00",
    addressLabel: "東京都港区六本木 3-2-1",
    serviceAreas: "港区",
    originalPriceJpy: "16000",
    campaignPriceJpy: "12800"
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

describe("ExchangeComposer approved shared shell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.querySelectorAll(".client-mobile-fullscreen-page,.client-action-dialog-overlay").forEach((node) => node.remove());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function renderAndOpen(context: "user" | "merchant" | "technician") {
    await act(async () => root.render(<ExchangeComposer context={context} onPublished={vi.fn()} />));
    const trigger = container.querySelector<HTMLButtonElement>('[data-action="open-composer"]');
    if (!trigger) throw new Error("missing compose trigger");
    await act(async () => trigger.click());
    return trigger;
  }

  it.each([
    ["user", "发送需求"],
    ["technician", "发送情报"]
  ] as const)("opens %s publication in the approved full-screen shell", async (context, title) => {
    await renderAndOpen(context);
    expect(document.body.querySelector('[data-testid="exchange-composer-shell"]')).not.toBeNull();
    expect(document.body.querySelector(".client-mobile-fullscreen-page")).not.toBeNull();
    expect(document.body.textContent).toContain(title);
    expect(document.body.querySelector('[data-testid="exchange-intelligence-bottom-sheet"]')).toBeNull();
  });

  it("does not publish on Next and publishes only from review", async () => {
    vi.mocked(publishExchangePost).mockResolvedValue(publishedIntelligence);
    await renderAndOpen("technician");
    fillValidIntelligenceDraft();

    await act(async () => clickAction("composer-next"));
    expect(publishExchangePost).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')).not.toBeNull();

    await act(async () => clickAction("composer-publish"));
    await waitFor(() => expect(publishExchangePost).toHaveBeenCalledTimes(1));
  });

  it("splits date and time controls and removes unavailable upload controls", async () => {
    await renderAndOpen("technician");
    expect(document.body.querySelector('[name="serviceStartDate"]')).not.toBeNull();
    expect(document.body.querySelector('[name="serviceStartTime"]')).not.toBeNull();
    expect(document.body.querySelector('[type="datetime-local"]')).toBeNull();
    expect(document.body.querySelector('[data-action="reference-upload-deferred"]')).toBeNull();
  });

  it("guards dirty close, preserves the draft on cancel, and restores trigger focus after discard", async () => {
    const trigger = await renderAndOpen("user");
    const title = document.body.querySelector<HTMLInputElement>('[name="title"]');
    if (!title) throw new Error("missing title");
    await act(async () => setInputValue(title, "仍需编辑的需求"));

    const close = document.body.querySelector<HTMLButtonElement>('[aria-label="关闭"]');
    if (!close) throw new Error("missing close");
    await act(async () => close.click());
    expect(document.body.textContent).toContain("放弃本次编辑？");

    const continueEditing = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "继续编辑");
    if (!continueEditing) throw new Error("missing continue editing");
    await act(async () => continueEditing.click());
    expect(document.body.querySelector<HTMLInputElement>('[name="title"]')?.value).toBe("仍需编辑的需求");

    await act(async () => close.click());
    const discard = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "放弃修改");
    if (!discard) throw new Error("missing discard");
    await act(async () => discard.click());
    expect(document.body.querySelector('[data-testid="exchange-composer-shell"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
