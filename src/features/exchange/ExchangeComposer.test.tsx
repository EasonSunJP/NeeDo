// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publishExchangePost } from "./api";
import { ExchangeComposer, getExchangeComposerMode } from "./ExchangeComposer";
import { exchangeText } from "./i18n";
import type { ExchangePost } from "./types";

vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("../../theme/ClientThemeProvider", () => ({
  getClientThemeClassName: () => "client-theme-dark-green",
  useClientTheme: () => ({ theme: "dark-green", isNight: true })
}));
vi.mock("./api", () => ({ publishExchangePost: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const publishedPost: ExchangePost = {
  id: 42,
  type: "demand",
  status: "published",
  title: "正式发布的需求",
  detail: "持久化正文",
  contentLocale: "zh-CN",
  areaLabel: "新宿区",
  serviceStartAt: "2026-08-31T04:00:00.000Z",
  serviceEndAt: "2026-08-31T05:00:00.000Z",
  expiresAt: "2026-08-31T05:00:00.000Z",
  publishedAt: "2026-08-30T04:00:00.000Z",
  publisher: { publicId: "u0000000042", identityType: "customer", displayName: "客户 42", avatarUrl: null },
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: true },
  demand: { budgetMinJpy: 5000, budgetMaxJpy: 8000 },
  intelligence: null
};

describe("ExchangeComposer identity boundary", () => {
  it("offers only the subtype allowed by the protected portal context", () => {
    expect(getExchangeComposerMode("user")).toBe("demand");
    expect(getExchangeComposerMode("merchant")).toBe("intelligence");
    expect(getExchangeComposerMode("technician")).toBe("intelligence");

    const customer = renderToStaticMarkup(<ExchangeComposer context="user" onPublished={vi.fn()} />);
    const merchant = renderToStaticMarkup(<ExchangeComposer context="merchant" onPublished={vi.fn()} />);
    const technician = renderToStaticMarkup(<ExchangeComposer context="technician" onPublished={vi.fn()} />);
    expect(customer).toContain("发布需求");
    expect(customer).not.toContain("发布情报");
    expect(merchant).toContain("发布情报");
    expect(merchant).not.toContain("发布需求");
    expect(technician).toContain("发布情报");
    expect(customer + merchant + technician).not.toContain("切换发布身份");
  });

  it("provides every control label in all five UI languages", () => {
    for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
      expect(exchangeText("publishDemand", language)).toBeTruthy();
      expect(exchangeText("publishIntelligence", language)).toBeTruthy();
      expect(exchangeText("title", language)).toBeTruthy();
      expect(exchangeText("serviceWindow", language)).toBeTruthy();
      expect(exchangeText("publishFailed", language)).toBeTruthy();
    }
  });
});

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

function fillDemandForm(container: ParentNode) {
  const values: Record<string, string> = {
    title: "正式发布的需求",
    detail: "持久化正文",
    areaLabel: "新宿区",
    serviceStartAt: "2026-08-31T13:00",
    serviceEndAt: "2026-08-31T14:00",
    expiresAt: "2026-08-31T14:00",
    budgetMinJpy: "5000",
    budgetMaxJpy: "8000"
  };
  Object.entries(values).forEach(([name, value]) => {
    const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
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

describe("ExchangeComposer publication", () => {
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
    container.remove();
    vi.unstubAllGlobals();
  });

  it("submits a customer demand with a fresh key and no actor selector", async () => {
    const onPublished = vi.fn();
    vi.mocked(publishExchangePost).mockResolvedValue(publishedPost);
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={onPublished} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());

    fillDemandForm(document.body);

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-composer"]')?.click());
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(publishedPost));

    expect(publishExchangePost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "demand",
        title: "正式发布的需求",
        budgetMinJpy: 5000,
        budgetMaxJpy: 8000,
        contentLocale: "zh-CN"
      }),
      "123e4567-e89b-42d3-a456-426614174000"
    );
    expect(document.body.querySelector('[name="identityId"]')).toBeNull();
  });

  it("keeps the form open and shows a formal error when publication fails", async () => {
    vi.mocked(publishExchangePost).mockRejectedValue(new Error("error.network"));
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());
    fillDemandForm(document.body);
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-composer"]')?.click());
    await waitFor(() => expect(document.body.textContent).toContain("发布失败，请保留表单并重试"));
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("restores the approved full-screen send-demand composition without fake media persistence", async () => {
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());

    expect(document.body.textContent).toContain("发送需求");
    expect(document.body.textContent).toContain("告诉平台你想要什么");
    expect(document.body.textContent).toContain("上传参考图");
    expect(document.body.textContent).toContain("发布前确认");
    expect(document.body.textContent).toContain("发送到 NeeDo");
    expect(document.body.querySelectorAll('[data-action="reference-upload-deferred"]')).toHaveLength(3);
    expect(Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-action="reference-upload-deferred"]')).every((button) => button.disabled)).toBe(true);
    expect(document.body.querySelector('[data-testid="exchange-demand-composer-page"]')).not.toBeNull();
    expect(document.body.innerHTML).not.toMatch(/localStorage|needoExchangeBridge|findNeedoPost/u);
  });
});
