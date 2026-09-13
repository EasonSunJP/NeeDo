// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExchangeClaim,
  getMyExchangeClaim,
  listExchangeClaimOptions,
  withdrawExchangeClaim
} from "./api";
import { ExchangeClaimPanel } from "./ExchangeClaimPanel";
import type { ExchangeClaim, ExchangeClaimOption, ExchangePost } from "./types";

vi.mock("./api", () => ({
  createExchangeClaim: vi.fn(),
  getMyExchangeClaim: vi.fn(),
  listExchangeClaimOptions: vi.fn(),
  withdrawExchangeClaim: vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const post: ExchangePost = {
  id: 41,
  type: "demand",
  status: "published",
  title: "选配正式需求",
  detail: "需要一名服务者",
  contentLocale: "zh-CN",
  areaLabel: "東京都港区",
  serviceStartAt: "2026-09-02T04:00:00.000Z",
  serviceEndAt: "2026-09-02T06:00:00.000Z",
  expiresAt: "2026-09-02T03:00:00.000Z",
  publishedAt: "2026-09-01T01:00:00.000Z",
  publisher: null,
  counts: { comments: 0, likes: 0, shares: 0 },
  viewer: { liked: false, canWithdraw: false, canClaim: true, canViewClaims: false },
  demand: {
    serviceMode: "store",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "selective",
    budgetMode: "total",
    budgetMinJpy: 8_000,
    budgetMaxJpy: 30_000,
    address: {
      line1: "東京都港区",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "general"
    }
  },
  intelligence: null
};

const option: ExchangeClaimOption = {
  scheduleSlotId: 91,
  shop: { id: 7, name: "GINZA Calm Body Lab" },
  technician: { profileId: 12, publicId: "NT00000012", displayName: "山田 美咲" },
  service: { ref: "technician:31", name: "肩颈深层护理", durationMinutes: 120 },
  startsAt: "2026-09-02T04:00:00.000Z",
  endsAt: "2026-09-02T06:00:00.000Z"
};

const activeClaim: ExchangeClaim = {
  id: 73,
  exchangePostId: 41,
  status: "active",
  provider: { publicId: "NT00000012", displayName: "山田 美咲", avatarUrl: null },
  shop: option.shop,
  technician: option.technician,
  service: option.service,
  scheduleSlotId: 91,
  quoteAmountJpy: 15_000,
  currency: "JPY",
  message: "可以按时到达",
  estimatedStartsAt: option.startsAt,
  estimatedEndsAt: option.endsAt,
  createdAt: "2026-09-01T02:00:00.000Z",
  withdrawnAt: null,
  terminalAt: null
};

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

let container: HTMLDivElement;
let root: Root;

describe("ExchangeClaimPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "exchange-claim-ui-0001") });
    vi.mocked(getMyExchangeClaim).mockResolvedValue(null);
    vi.mocked(listExchangeClaimOptions).mockResolvedValue({
      list: [option],
      total: 1,
      page: 1,
      page_size: 20
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows persisted shop, technician, service and time options with required marks", async () => {
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

    expect(getMyExchangeClaim).toHaveBeenCalledWith("41", expect.any(AbortSignal));
    expect(listExchangeClaimOptions).toHaveBeenCalledWith("41", expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(document.body.textContent).toContain("山田 美咲");
    expect(document.body.textContent).toContain("肩颈深层护理");
    expect(document.body.textContent).toContain("服务项目 *");
    expect(document.body.textContent).toContain("报价 *");
    expect(document.body.textContent).toContain("留言（可选）");
  });

  it("disables the real submit action when no fulfillable claim option exists", async () => {
    vi.mocked(listExchangeClaimOptions).mockResolvedValue({
      list: [],
      total: 0,
      page: 1,
      page_size: 20
    });
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("指定时间内暂无可履约的技师与服务项目"));

    const submit = document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!;
    expect(submit.disabled).toBe(true);
    await act(async () => submit.click());
    expect(createExchangeClaim).not.toHaveBeenCalled();
  });

  it("keeps the real submit action available for a selected option and legal quote", async () => {
    vi.mocked(createExchangeClaim).mockResolvedValue(activeClaim);
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-option-id="91"]')!.click());
    await act(async () => {
      changeInput(
        document.body.querySelector<HTMLInputElement>('input[name="claimQuoteAmountJpy"]')!,
        "15000"
      );
    });

    const submit = document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!;
    expect(submit.disabled).toBe(false);
    await act(async () => submit.click());
    await waitFor(() => expect(document.body.textContent).toContain("抢单已提交"));
    expect(createExchangeClaim).toHaveBeenCalledWith(
      "41",
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "exchange-claim-ui-0001"
    );
  });

  it("submits only the chosen server option and keeps inputs after a server error", async () => {
    vi.mocked(createExchangeClaim)
      .mockRejectedValueOnce(new Error("error.exchange.claim_time_conflict"))
      .mockResolvedValueOnce(activeClaim);
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

    const optionButton = document.body.querySelector<HTMLButtonElement>('[data-option-id="91"]')!;
    const quote = document.body.querySelector<HTMLInputElement>('input[name="claimQuoteAmountJpy"]')!;
    const message = document.body.querySelector<HTMLTextAreaElement>('textarea[name="claimMessage"]')!;
    await act(async () => optionButton.click());
    await act(async () => {
      changeInput(quote, "15000");
      changeInput(message, "原文留言保持不变");
    });
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("所选时间已不可用"));

    expect(quote.value).toBe("15000");
    expect(message.value).toBe("原文留言保持不变");
    expect(createExchangeClaim).toHaveBeenCalledWith(
      "41",
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: "原文留言保持不变" },
      "exchange-claim-ui-0001"
    );

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("抢单已提交"));
    expect(createExchangeClaim).toHaveBeenLastCalledWith(
      "41",
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: "原文留言保持不变" },
      "exchange-claim-ui-0001"
    );
  });

  it("submits a Quick claim from the same persisted shop, technician, service and time card", async () => {
    vi.mocked(createExchangeClaim).mockResolvedValue(activeClaim);
    const quickPost: ExchangePost = {
      ...post,
      title: "速配正式需求",
      demand: { ...post.demand!, matchMode: "quick" }
    };

    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={quickPost} />));
    await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

    expect(document.body.textContent).toContain("速配");
    expect(document.body.textContent).not.toContain("SELECTIVE");
    expect(document.body.textContent).toContain("山田 美咲");
    expect(document.body.textContent).toContain("肩颈深层护理");

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-option-id="91"]')!.click());
    await act(async () => {
      changeInput(
        document.body.querySelector<HTMLInputElement>('input[name="claimQuoteAmountJpy"]')!,
        "15000"
      );
    });
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!.click()
    );
    await waitFor(() => expect(document.body.textContent).toContain("等待速配凑齐目标人数"));

    expect(createExchangeClaim).toHaveBeenCalledWith(
      "41",
      { scheduleSlotId: 91, quoteAmountJpy: 15_000, message: null },
      "exchange-claim-ui-0001"
    );
  });

  it("shows a terminal matched Quick claim without a withdrawal action", async () => {
    vi.mocked(getMyExchangeClaim).mockResolvedValue({
      ...activeClaim,
      status: "matched",
      terminalAt: "2026-09-01T03:00:00.000Z"
    });
    const quickPost: ExchangePost = {
      ...post,
      demand: { ...post.demand!, matchMode: "quick" }
    };

    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={quickPost} />));
    await waitFor(() => expect(document.body.textContent).toContain("已匹配"));

    expect(document.body.textContent).toContain("GINZA Calm Body Lab");
    expect(document.body.textContent).toContain("山田 美咲 · NT00000012");
    expect(document.body.textContent).toContain("肩颈深层护理");
    expect(document.body.querySelector('[data-action="withdraw-claim"]')).toBeNull();
  });

  it("rotates the create idempotency key when the normalized payload changes", async () => {
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    vi.mocked(createExchangeClaim).mockRejectedValue(new Error("error.exchange.claim_time_conflict"));
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("GINZA Calm Body Lab"));

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-option-id="91"]')!.click());
    const quote = document.body.querySelector<HTMLInputElement>('input[name="claimQuoteAmountJpy"]')!;
    await act(async () => changeInput(quote, "15000"));
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!.click());
    await waitFor(() => expect(createExchangeClaim).toHaveBeenCalledTimes(1));

    await act(async () => changeInput(quote, "16000"));
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="submit-claim"]')!.click());
    await waitFor(() => expect(createExchangeClaim).toHaveBeenCalledTimes(2));

    const createMock = vi.mocked(createExchangeClaim);
    expect(createMock.mock.calls[0]?.[2]).toBe("00000000-0000-4000-8000-000000000001");
    expect(createMock.mock.calls[1]?.[2]).toBe("00000000-0000-4000-8000-000000000002");
  });

  it("clears the previous Request claim and form state when post id changes", async () => {
    vi.mocked(getMyExchangeClaim)
      .mockResolvedValueOnce(activeClaim)
      .mockResolvedValueOnce(null);
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("抢单已提交"));

    const nextPost = { ...post, id: 42, title: "另一条正式需求" };
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={nextPost} />));
    await waitFor(() => expect(listExchangeClaimOptions).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({ page: 1, pageSize: 20 })
    ));

    expect(document.body.textContent).not.toContain("抢单已提交");
    expect(document.body.querySelector('[data-action="submit-claim"]')).not.toBeNull();
  });

  it("loads the persisted own claim after refresh and withdraws with confirmation", async () => {
    vi.mocked(getMyExchangeClaim).mockResolvedValue(activeClaim);
    vi.mocked(withdrawExchangeClaim).mockResolvedValue({
      ...activeClaim,
      status: "withdrawn",
      withdrawnAt: "2026-09-01T02:30:00.000Z",
      terminalAt: "2026-09-01T02:30:00.000Z"
    });
    await act(async () => root.render(<ExchangeClaimPanel language="zh" post={post} />));
    await waitFor(() => expect(document.body.textContent).toContain("抢单已提交"));

    expect(listExchangeClaimOptions).not.toHaveBeenCalled();
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="withdraw-claim"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("已撤回"));

    expect(globalThis.confirm).toHaveBeenCalled();
    expect(withdrawExchangeClaim).toHaveBeenCalledWith("73", "exchange-claim-ui-0001");
  });
});
