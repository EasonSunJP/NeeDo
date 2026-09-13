// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRequestPublicationContext,
  listExchangeIntelligenceServiceOptions,
  publishExchangePost
} from "./api";
import { ExchangeComposer, getExchangeComposerMode } from "./ExchangeComposer";
import { exchangeText } from "./i18n";
import type { ExchangePost } from "./types";

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
  listExchangeIntelligenceServiceOptions: vi.fn(),
  publishExchangePost: vi.fn()
}));

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
  viewer: { liked: false, canWithdraw: true, canClaim: false, canViewClaims: false },
  demand: {
    serviceMode: "store",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: 5000,
    budgetMaxJpy: 8000,
    address: {
      line1: "新宿区",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner"
    }
  },
  intelligence: null
};

describe("ExchangeComposer identity boundary", () => {
  it("offers only the subtype allowed by the protected portal context", () => {
    authHasPermission.mockReturnValue(false);
    expect(getExchangeComposerMode("user")).toBe("demand");
    expect(getExchangeComposerMode("merchant")).toBe("intelligence");
    expect(getExchangeComposerMode("technician")).toBe("intelligence");

    const customer = renderToStaticMarkup(<ExchangeComposer context="user" onPublished={vi.fn()} />);
    authHasPermission.mockImplementation((permission) => permission === "exchange:posts:create-intelligence");
    const merchant = renderToStaticMarkup(<ExchangeComposer context="merchant" onPublished={vi.fn()} />);
    const technician = renderToStaticMarkup(<ExchangeComposer context="technician" onPublished={vi.fn()} />);
    expect(customer).toContain("发布需求");
    expect(customer).not.toContain("发布情报");
    expect(merchant).toContain("发布情报");
    expect(merchant).not.toContain("发布需求");
    expect(technician).toContain("发布情报");
    expect(customer + merchant + technician).not.toContain("切换发布身份");

    authHasPermission.mockImplementation((permission) => permission === "exchange:posts:create-demand");
    expect(renderToStaticMarkup(<ExchangeComposer context="merchant" onPublished={vi.fn()} />)).toBe("");
  });

  it("provides every control label in all five UI languages", () => {
    for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
      expect(exchangeText("publishDemand", language)).toBeTruthy();
      expect(exchangeText("publishIntelligence", language)).toBeTruthy();
      expect(exchangeText("title", language)).toBeTruthy();
      expect(exchangeText("serviceWindow", language)).toBeTruthy();
      expect(exchangeText("publishFailed", language)).toBeTruthy();
      expect(exchangeText("next", language)).toBeTruthy();
      expect(exchangeText("publish", language)).toBeTruthy();
      expect(exchangeText("discardComposerTitle", language)).toBeTruthy();
      expect(exchangeText("targetProviderCount", language)).toBeTruthy();
      expect(exchangeText("matchMode", language)).toBeTruthy();
      expect(exchangeText("budgetMode", language)).toBeTruthy();
      expect(exchangeText("addressLine1", language)).toBeTruthy();
      expect(exchangeText("publisherIdentityVisible", language)).toBeTruthy();
      expect(exchangeText("requestFeeFreezeNotice", language)).toBeTruthy();
      expect(exchangeText("home", language)).toBeTruthy();
      expect(exchangeText("ekycRequired", language)).toBeTruthy();
    }

    expect(exchangeText("tellPlatform", "ja")).toBe("需要設定");
    expect(exchangeText("demandComposerIntro", "ja")).toBe("希望条件をご記入ください。");
    expect(exchangeText("required", "ja")).toBe("「＊」のついた必須項目を必ずご記入ください。");
    expect(exchangeText("authoredLanguage", "ja")).toBe("言語");
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
    serviceStartDate: "2026-08-31",
    serviceStartTime: "13:00",
    serviceEndDate: "2026-08-31",
    serviceEndTime: "14:00",
    expiresDate: "2026-08-31",
    expiresTime: "14:00",
    targetProviderCount: "1",
    budgetMinJpy: "5000",
    budgetMaxJpy: "8000",
    addressLine1: "新宿区"
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
    authHasPermission.mockReturnValue(false);
    vi.mocked(getRequestPublicationContext).mockResolvedValue({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "standard",
      maxTargetProviderCount: 1,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
    });
    vi.mocked(listExchangeIntelligenceServiceOptions).mockResolvedValue({
      list: [], total: 0, page: 1, page_size: 100
    });
    vi.stubGlobal("crypto", { randomUUID: () => "123e4567-e89b-42d3-a456-426614174000" });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("validates on Next, then submits a customer demand with a fresh key and no actor selector", async () => {
    const onPublished = vi.fn();
    vi.mocked(publishExchangePost).mockResolvedValue(publishedPost);
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={onPublished} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());

    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());

    await act(async () =>
      setInputValue(document.body.querySelector<HTMLSelectElement>('select[name="contentLocale"]')!, "ja")
    );
    fillDemandForm(document.body);

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.click());
    expect(publishExchangePost).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')?.textContent).toContain("日本語");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(publishedPost));

    expect(publishExchangePost).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "demand",
        serviceMode: "store",
        title: "正式发布的需求",
        budgetMinJpy: 5000,
        budgetMaxJpy: 8000,
        targetProviderCount: 1,
        matchMode: "quick",
        budgetMode: "total",
        addressLine1: "新宿区",
        addressLine2: null,
        addressLine3: null,
        addressLine2Public: false,
        addressLine3Public: false,
        publisherIdentityPublic: false,
        contentLocale: "ja"
      }),
      "123e4567-e89b-42d3-a456-426614174000"
    );
    expect(document.body.querySelector('[name="identityId"]')).toBeNull();
  });

  it("keeps the review open and reuses the same idempotency key when an identical publication is retried", async () => {
    vi.mocked(publishExchangePost)
      .mockRejectedValueOnce(new Error("error.network"))
      .mockResolvedValueOnce(publishedPost);
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());
    fillDemandForm(document.body);
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());
    await waitFor(() => expect(document.body.textContent).toContain("发布失败，请保留表单并重试"));
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')).not.toBeNull();
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());
    await waitFor(() => expect(publishExchangePost).toHaveBeenCalledTimes(2));
    expect(vi.mocked(publishExchangePost).mock.calls[0]?.[1]).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(vi.mocked(publishExchangePost).mock.calls[1]?.[1]).toBe("123e4567-e89b-42d3-a456-426614174000");
  });

  it("returns to edit and refreshes a stale Request target limit without losing the draft", async () => {
    vi.mocked(getRequestPublicationContext)
      .mockResolvedValueOnce({
        canPublish: true,
        capacitySource: "customer_membership",
        membershipLevel: "gold",
        maxTargetProviderCount: 3,
        publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
      })
      .mockResolvedValueOnce({
        canPublish: true,
        capacitySource: "customer_membership",
        membershipLevel: "silver",
        maxTargetProviderCount: 2,
        publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
      });
    vi.mocked(publishExchangePost).mockRejectedValueOnce(new Error("error.exchange.request_target_limit"));
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());
    fillDemandForm(document.body);
    setInputValue(document.body.querySelector<HTMLInputElement>('[name="targetProviderCount"]')!, "3");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());

    await waitFor(() => expect(getRequestPublicationContext).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.body.querySelector<HTMLInputElement>('[name="targetProviderCount"]')?.max).toBe("2"));
    expect(document.body.querySelector<HTMLInputElement>('[name="targetProviderCount"]')?.value).toBe("3");
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')).toBeNull();
    expect(document.body.textContent).toContain("所需人数超出当前发布上限");
  });

  it("requires a fresh review after the server fee rule changes and reuses the same key", async () => {
    vi.mocked(getRequestPublicationContext)
      .mockResolvedValueOnce({
        canPublish: true,
        capacitySource: "customer_membership",
        membershipLevel: "standard",
        maxTargetProviderCount: 1,
        publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 1 }
      })
      .mockResolvedValueOnce({
        canPublish: true,
        capacitySource: "customer_membership",
        membershipLevel: "standard",
        maxTargetProviderCount: 1,
        publicationFee: { amountNdp: 1200, currency: "TEST_NDP", ruleSetVersion: 2 }
      });
    vi.mocked(publishExchangePost)
      .mockRejectedValueOnce(new Error("error.exchange.request_fee_unavailable"))
      .mockResolvedValueOnce(publishedPost);
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());
    await waitFor(() => expect(document.body.querySelector('[name="targetProviderCount"]')).not.toBeNull());
    fillDemandForm(document.body);
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.click());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());

    await waitFor(() => expect(getRequestPublicationContext).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.body.querySelector('[data-testid="exchange-publication-review"]')).toBeNull());
    expect(document.body.textContent).toContain("发布费用暂不可用");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-next"]')?.click());
    expect(document.body.querySelector('[data-testid="exchange-publication-review"]')?.textContent).toContain("1,200 Test NDP");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="composer-publish"]')?.click());
    await waitFor(() => expect(publishExchangePost).toHaveBeenCalledTimes(2));
    expect(vi.mocked(publishExchangePost).mock.calls[0]?.[1]).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(vi.mocked(publishExchangePost).mock.calls[1]?.[1]).toBe("123e4567-e89b-42d3-a456-426614174000");
  });

  it("restores the approved full-screen send-demand composition without unavailable media controls", async () => {
    await act(async () => root.render(<ExchangeComposer context="user" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());

    expect(document.body.textContent).toContain("发送需求");
    expect(document.body.textContent).toContain("告诉平台你想要什么");
    expect(document.body.textContent).toContain("下一步");
    expect(document.body.textContent).not.toContain("上传参考图");
    expect(document.body.querySelectorAll('[data-action="reference-upload-deferred"]')).toHaveLength(0);
    expect(document.body.querySelector('[data-testid="exchange-composer-shell"]')).not.toBeNull();
    expect(document.body.querySelector('[type="datetime-local"]')).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/localStorage|needoExchangeBridge|findNeedoPost/u);
  });

  it("keeps merchant publication fixed to Intelligence even with both permissions", async () => {
    authHasPermission.mockImplementation((permission) => [
      "exchange:posts:create-demand",
      "exchange:posts:create-intelligence"
    ].includes(permission));
    await act(async () => root.render(<ExchangeComposer context="merchant" onPublished={vi.fn()} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[data-action="open-composer"]')?.click());

    expect(document.body.querySelector('[data-testid="exchange-post-type-selector"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="exchange-intelligence-composer-fields"]')).not.toBeNull();
    expect(document.body.textContent).toContain("情报");
    expect(document.body.textContent).not.toContain("需求 *");
  });
});
