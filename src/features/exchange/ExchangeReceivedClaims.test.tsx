// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import {
  createExchangeMatchingBookings,
  getExchangeMatching,
  listReceivedExchangeClaims,
  selectExchangeMatching
} from "./api";
import { ExchangeReceivedClaims } from "./ExchangeReceivedClaims";
import type { ExchangeClaim, ExchangeMatching } from "./types";

vi.mock("./api", () => ({
  createExchangeMatchingBookings: vi.fn(),
  getExchangeMatching: vi.fn(),
  listReceivedExchangeClaims: vi.fn(),
  selectExchangeMatching: vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function claim(id: number, message: string, quoteAmountJpy = 10_000 + id): ExchangeClaim {
  return {
    id,
    exchangePostId: 41,
    status: "active",
    provider: { publicId: `NT000000${id}`, displayName: `服务者 ${id}`, avatarUrl: null },
    shop: { id: 7, name: "GINZA Calm Body Lab" },
    technician: { profileId: id, publicId: `NT000000${id}`, displayName: `技师 ${id}` },
    service: { ref: `technician:${id}`, name: `真实服务 ${id}`, durationMinutes: 60 },
    scheduleSlotId: 90 + id,
    quoteAmountJpy,
    currency: "JPY",
    message,
    estimatedStartsAt: "2026-09-02T04:00:00.000Z",
    estimatedEndsAt: "2026-09-02T05:00:00.000Z",
    createdAt: "2026-09-01T02:00:00.000Z",
    withdrawnAt: null,
    terminalAt: null
  };
}

function matching(overrides: Partial<ExchangeMatching> = {}): ExchangeMatching {
  return {
    exchangePostId: 41,
    status: "open",
    version: 6,
    effectiveTargetProviderCount: 1,
    effectiveBudgetMaxJpy: 12_000,
    selectedQuoteTotalJpy: 0,
    matchedAt: null,
    participants: [],
    viewer: { canSelect: true, canCreateBookings: false },
    ...overrides
  };
}

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

let container: HTMLDivElement;
let root: Root;

describe("ExchangeReceivedClaims", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "exchange-match-select-0001")
    });
    vi.mocked(getExchangeMatching).mockResolvedValue(matching());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    container.remove();
  });

  it("renders only persisted claim rows and preserves provider messages in their original language", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "I can arrive early. 原文のままです。")],
      total: 1,
      page: 1,
      page_size: 10
    });
    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));

    expect(listReceivedExchangeClaims).toHaveBeenCalledWith("41", expect.objectContaining({ page: 1, pageSize: 10 }));
    expect(document.body.textContent).toContain("NT0000001");
    expect(document.body.textContent).toContain("GINZA Calm Body Lab");
    expect(document.body.textContent).toContain("技师 1");
    expect(document.body.textContent).toContain("真实服务 1");
    expect(document.body.textContent).toContain("I can arrive early. 原文のままです。");
    expect(document.body.querySelector('[data-claim-id="1"]')).not.toBeNull();
    expect(document.body.querySelector('[data-match-claim-id="1"]')).not.toBeNull();
    expect(Array.from(document.body.querySelectorAll("button")).map((button) => button.textContent).join(" ")).not.toMatch(/追加预算|预约|支付/u);
  });

  it("enables exact selection only at the effective count and budget, then persists one versioned match", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 11_000), claim(2, "second", 13_000)],
      total: 2,
      page: 1,
      page_size: 10
    });
    vi.mocked(selectExchangeMatching).mockResolvedValue(
      matching({
        status: "matched",
        version: 7,
        selectedQuoteTotalJpy: 11_000,
        matchedAt: "2026-09-01T03:00:00.000Z",
        viewer: { canSelect: false, canCreateBookings: false },
        participants: [
          {
            exchangeClaimId: 1,
            provider: { publicId: "NT0000001", displayName: "服务者 1", avatarUrl: null },
            shop: { id: 7, name: "GINZA Calm Body Lab" },
            technician: { profileId: 1, publicId: "NT0000001", displayName: "技师 1" },
            service: { ref: "technician:1", name: "真实服务 1", durationMinutes: 60 },
            scheduleSlotId: 91,
            quoteAmountJpy: 11_000,
            currency: "JPY",
            estimatedStartsAt: "2026-09-02T04:00:00.000Z",
            estimatedEndsAt: "2026-09-02T05:00:00.000Z",
            matchedAt: "2026-09-01T03:00:00.000Z",
            booking: null
          }
        ]
      })
    );

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));

    const submit = document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!;
    expect(submit.disabled).toBe(true);

    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="2"]')!.click()
    );
    expect(submit.disabled).toBe(false);
    expect(document.body.textContent).toContain("¥13,000");

    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    expect(submit.disabled).toBe(false);

    await act(async () => submit.click());
    await waitFor(() => expect(document.body.textContent).toContain("匹配已完成"));

    expect(selectExchangeMatching).toHaveBeenCalledWith(
      "41",
      {
        selectedClaimIds: [1],
        expectedVersion: 6,
        budgetConfirmation: null,
        targetConfirmation: null
      },
      "exchange-match-select-0001"
    );
    expect(document.body.textContent).toContain("服务者 1");
    expect(document.body.querySelector('[data-action="complete-exchange-match"]')).toBeNull();
    expect(
      Array.from(document.body.querySelectorAll("button"))
        .map((button) => button.textContent)
        .join(" ")
    ).not.toMatch(/预约|支付/u);
  });

  it("renders the server target-reduction preview and requires a second explicit command", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 11_000), claim(2, "second", 12_000)],
      total: 2,
      page: 1,
      page_size: 10
    });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ effectiveTargetProviderCount: 2, effectiveBudgetMaxJpy: 30_000 })
    );
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174001")
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174002");
    vi.mocked(selectExchangeMatching)
      .mockRejectedValueOnce(
        new ApiClientError(
          "error.exchange.match_target_confirmation_required",
          40999,
          409,
          {
            currentVersion: 6,
            selectedCount: 1,
            selectedQuoteTotalJpy: 11_000,
            effectiveTargetProviderCount: 2,
            effectiveBudgetMaxJpy: 30_000,
            requiredTargetProviderCount: 1,
            requiredBudgetMaxJpy: null,
            requiredBudgetIncreaseJpy: 0,
            requiresTargetConfirmation: true,
            requiresBudgetConfirmation: false
          }
        )
      )
      .mockResolvedValueOnce(
        matching({
          status: "matched",
          version: 8,
          effectiveTargetProviderCount: 1,
          effectiveBudgetMaxJpy: 30_000,
          selectedQuoteTotalJpy: 11_000,
          matchedAt: "2026-09-01T03:00:00.000Z",
          viewer: { canSelect: false, canCreateBookings: false }
        })
      );

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!.click()
    );

    await waitFor(() => expect(document.body.textContent).toContain("2 → 1"));
    expect(document.body.textContent).toContain("以下数值来自服务端");
    expect(selectExchangeMatching).toHaveBeenNthCalledWith(
      1,
      "41",
      {
        selectedClaimIds: [1],
        expectedVersion: 6,
        budgetConfirmation: null,
        targetConfirmation: null
      },
      "123e4567-e89b-42d3-a456-426614174001"
    );

    await act(async () =>
      document.body
        .querySelector<HTMLButtonElement>('[data-action="confirm-exchange-match-adjustment"]')!
        .click()
    );
    await waitFor(() => expect(document.body.textContent).toContain("匹配已完成"));
    expect(selectExchangeMatching).toHaveBeenNthCalledWith(
      2,
      "41",
      {
        selectedClaimIds: [1],
        expectedVersion: 6,
        budgetConfirmation: null,
        targetConfirmation: {
          action: "reduce_to_selected_count",
          confirmedTargetProviderCount: 1
        }
      },
      "123e4567-e89b-42d3-a456-426614174002"
    );
  });

  it("renders exact budget and combined adjustment proposals from server data", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 31_000), claim(2, "second", 14_000)],
      total: 2,
      page: 1,
      page_size: 10
    });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ effectiveTargetProviderCount: 2, effectiveBudgetMaxJpy: 30_000 })
    );
    vi.mocked(selectExchangeMatching).mockRejectedValueOnce(
      new ApiClientError(
        "error.exchange.match_target_confirmation_required",
        40999,
        409,
        {
          currentVersion: 6,
          selectedCount: 1,
          selectedQuoteTotalJpy: 31_000,
          effectiveTargetProviderCount: 2,
          effectiveBudgetMaxJpy: 30_000,
          requiredTargetProviderCount: 1,
          requiredBudgetMaxJpy: 31_000,
          requiredBudgetIncreaseJpy: 1_000,
          requiresTargetConfirmation: true,
          requiresBudgetConfirmation: true
        }
      )
    );

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!.click()
    );

    await waitFor(() => expect(document.body.textContent).toContain("¥30,000 → ¥31,000"));
    expect(document.body.textContent).toContain("增加 ¥1,000");
    expect(document.body.textContent).toContain("2 → 1");
    expect(document.body.querySelector('[data-action="confirm-exchange-match-adjustment"]')).not.toBeNull();
  });

  it("renders a budget-only proposal when the selected count already matches", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 11_000), claim(2, "second", 12_000)],
      total: 2,
      page: 1,
      page_size: 10
    });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ effectiveTargetProviderCount: 2, effectiveBudgetMaxJpy: 20_000 })
    );
    vi.mocked(selectExchangeMatching).mockRejectedValueOnce(
      new ApiClientError(
        "error.exchange.match_budget_confirmation_required",
        41001,
        409,
        {
          currentVersion: 6,
          selectedCount: 2,
          selectedQuoteTotalJpy: 23_000,
          effectiveTargetProviderCount: 2,
          effectiveBudgetMaxJpy: 20_000,
          requiredTargetProviderCount: null,
          requiredBudgetMaxJpy: 23_000,
          requiredBudgetIncreaseJpy: 3_000,
          requiresTargetConfirmation: false,
          requiresBudgetConfirmation: true
        }
      )
    );

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="2"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!.click()
    );

    await waitFor(() => expect(document.body.textContent).toContain("¥20,000 → ¥23,000"));
    expect(document.body.textContent).toContain("增加 ¥3,000");
    expect(document.body.textContent).not.toContain("2 → 1");
  });

  it("invalidates a server adjustment preview when the publisher changes selection", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 11_000), claim(2, "second", 12_000)],
      total: 2,
      page: 1,
      page_size: 10
    });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ effectiveTargetProviderCount: 2, effectiveBudgetMaxJpy: 30_000 })
    );
    vi.mocked(selectExchangeMatching).mockRejectedValueOnce(
      new ApiClientError(
        "error.exchange.match_target_confirmation_required",
        40999,
        409,
        {
          currentVersion: 6,
          selectedCount: 1,
          selectedQuoteTotalJpy: 11_000,
          effectiveTargetProviderCount: 2,
          effectiveBudgetMaxJpy: 30_000,
          requiredTargetProviderCount: 1,
          requiredBudgetMaxJpy: null,
          requiredBudgetIncreaseJpy: 0,
          requiresTargetConfirmation: true,
          requiresBudgetConfirmation: false
        }
      )
    );

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!.click()
    );
    await waitFor(() =>
      expect(document.body.querySelector('[data-testid="exchange-matching-adjustment-preview"]')).not.toBeNull()
    );

    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="2"]')!.click()
    );
    expect(document.body.querySelector('[data-testid="exchange-matching-adjustment-preview"]')).toBeNull();
    expect(document.body.querySelector('[data-action="complete-exchange-match"]')).not.toBeNull();
  });

  it("refreshes persisted claims and matching state after a rejected selection", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({
      list: [claim(1, "first", 11_000)],
      total: 1,
      page: 1,
      page_size: 10
    });
    vi.mocked(selectExchangeMatching).mockRejectedValueOnce(new Error("version conflict"));

    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));
    await act(async () =>
      document.body.querySelector<HTMLInputElement>('[data-match-claim-id="1"]')!.click()
    );
    await act(async () =>
      document.body.querySelector<HTMLButtonElement>('[data-action="complete-exchange-match"]')!.click()
    );
    await waitFor(() => expect(document.body.querySelector('[role="alert"]')).not.toBeNull());

    expect(getExchangeMatching).toHaveBeenCalledTimes(2);
    expect(listReceivedExchangeClaims).toHaveBeenCalledTimes(2);
  });

  it("creates one formal booking per persisted participant and refreshes the display", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({ list: [claim(1, "first")], total: 1, page: 1, page_size: 10 });
    vi.mocked(getExchangeMatching)
      .mockResolvedValueOnce(
        matching({
          status: "matched",
          version: 7,
          matchedAt: "2026-09-03T04:00:00.000Z",
          viewer: { canSelect: false, canCreateBookings: true },
          participants: [
            {
              exchangeClaimId: 1,
              provider: { publicId: "NT0000001", displayName: "服务者 1", avatarUrl: null },
              shop: { id: 7, name: "GINZA Calm Body Lab" },
              technician: { profileId: 1, publicId: "NT0000001", displayName: "技师 1" },
              service: { ref: "technician:1", name: "真实服务 1", durationMinutes: 60 },
              scheduleSlotId: 91,
              quoteAmountJpy: 11_000,
              currency: "JPY",
              estimatedStartsAt: "2026-09-02T04:00:00.000Z",
              estimatedEndsAt: "2026-09-02T05:00:00.000Z",
              matchedAt: "2026-09-03T04:00:00.000Z",
              booking: null
            }
          ]
        })
      )
      .mockResolvedValueOnce(
        matching({
          status: "matched",
          version: 8,
          viewer: { canSelect: false, canCreateBookings: false },
          participants: [
            {
              exchangeClaimId: 1,
              provider: { publicId: "NT0000001", displayName: "服务者 1", avatarUrl: null },
              shop: { id: 7, name: "GINZA Calm Body Lab" },
              technician: { profileId: 1, publicId: "NT0000001", displayName: "技师 1" },
              service: { ref: "technician:1", name: "真实服务 1", durationMinutes: 60 },
              scheduleSlotId: 91,
              quoteAmountJpy: 11_000,
              currency: "JPY",
              estimatedStartsAt: "2026-09-02T04:00:00.000Z",
              estimatedEndsAt: "2026-09-02T05:00:00.000Z",
              matchedAt: "2026-09-03T04:00:00.000Z",
              booking: { orderId: 501, orderNo: "ND501", status: "pending" }
            }
          ]
        })
      );
    vi.mocked(createExchangeMatchingBookings).mockResolvedValue({
      exchangePostId: 41,
      matchingVersion: 8,
      bookedAt: "2026-09-03T04:01:00.000Z",
      orders: []
    });

    await act(async () => root.render(<ExchangeReceivedClaims context="user" language="zh" postId="41" />));
    await waitFor(() => expect(document.body.querySelector('[data-action="create-exchange-bookings"]')).not.toBeNull());

    expect(document.body.textContent).toContain("此操作会为每位入选服务者创建一张独立待接单预约。");
    expect(document.body.textContent).toContain("本步骤不会收取服务款。");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("ND501"));

    expect(document.body.textContent).toContain("预约已创建");
    expect(createExchangeMatchingBookings).toHaveBeenCalledWith("41", { expectedVersion: 7 }, "exchange-match-select-0001");
    expect(getExchangeMatching).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-action="create-exchange-bookings"]')).toBeNull();
    expect(document.body.querySelector<HTMLAnchorElement>('a[aria-label="查看订单"]')?.getAttribute("href")).toBe("/orders/501");
  });

  it("refreshes persisted matching state after a stale booking version without reporting a generic creation failure", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({ list: [claim(1, "first")], total: 1, page: 1, page_size: 10 });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ status: "matched", version: 7, viewer: { canSelect: false, canCreateBookings: true } })
    );
    vi.mocked(createExchangeMatchingBookings).mockRejectedValueOnce(
      new ApiClientError("error.exchange.match_booking_version_conflict", 40901, 409, null)
    );

    await act(async () => root.render(<ExchangeReceivedClaims context="user" language="zh" postId="41" />));
    await waitFor(() => expect(document.body.querySelector('[data-action="create-exchange-bookings"]')).not.toBeNull());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("匹配状态已变化，已刷新正式数据。"));

    expect(getExchangeMatching).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain("预约创建失败，请重试。");
  });

  it("reuses a failed booking idempotency key until the persisted matching version changes", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({ list: [claim(1, "first")], total: 1, page: 1, page_size: 10 });
    vi.mocked(getExchangeMatching).mockResolvedValue(
      matching({ status: "matched", version: 7, viewer: { canSelect: false, canCreateBookings: true } })
    );
    vi.mocked(createExchangeMatchingBookings).mockRejectedValue(new Error("network failed"));
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("123e4567-e89b-42d3-a456-426614174001");

    await act(async () => root.render(<ExchangeReceivedClaims context="user" language="zh" postId="41" />));
    await waitFor(() => expect(document.body.querySelector('[data-action="create-exchange-bookings"]')).not.toBeNull());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("预约创建失败，请重试。"));
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(createExchangeMatchingBookings).toHaveBeenCalledTimes(2));

    expect(vi.mocked(createExchangeMatchingBookings).mock.calls[0]?.[2]).toBe("123e4567-e89b-42d3-a456-426614174001");
    expect(vi.mocked(createExchangeMatchingBookings).mock.calls[1]?.[2]).toBe("123e4567-e89b-42d3-a456-426614174001");
  });

  it("rotates the booking idempotency key after a stale refresh returns a new matching version", async () => {
    vi.mocked(listReceivedExchangeClaims).mockResolvedValue({ list: [claim(1, "first")], total: 1, page: 1, page_size: 10 });
    vi.mocked(getExchangeMatching)
      .mockResolvedValueOnce(matching({ status: "matched", version: 7, viewer: { canSelect: false, canCreateBookings: true } }))
      .mockResolvedValueOnce(matching({ status: "matched", version: 8, viewer: { canSelect: false, canCreateBookings: true } }))
      .mockResolvedValueOnce(matching({ status: "matched", version: 9, viewer: { canSelect: false, canCreateBookings: false } }));
    vi.mocked(createExchangeMatchingBookings)
      .mockRejectedValueOnce(new ApiClientError("error.exchange.match_booking_version_conflict", 40901, 409, null))
      .mockResolvedValueOnce({ exchangePostId: 41, matchingVersion: 9, bookedAt: "2026-09-03T04:02:00.000Z", orders: [] });
    vi.mocked(globalThis.crypto.randomUUID)
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174007")
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174008");

    await act(async () => root.render(<ExchangeReceivedClaims context="user" language="zh" postId="41" />));
    await waitFor(() => expect(document.body.querySelector('[data-action="create-exchange-bookings"]')).not.toBeNull());
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("匹配状态已变化，已刷新正式数据。"));
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="create-exchange-bookings"]')!.click());
    await waitFor(() => expect(createExchangeMatchingBookings).toHaveBeenCalledTimes(2));

    expect(vi.mocked(createExchangeMatchingBookings).mock.calls[0]).toEqual(["41", { expectedVersion: 7 }, "123e4567-e89b-42d3-a456-426614174007"]);
    expect(vi.mocked(createExchangeMatchingBookings).mock.calls[1]).toEqual(["41", { expectedVersion: 8 }, "123e4567-e89b-42d3-a456-426614174008"]);
  });

  it("appends the next server page without replacing existing claims", async () => {
    vi.mocked(listReceivedExchangeClaims)
      .mockResolvedValueOnce({ list: [claim(1, "first")], total: 2, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ list: [claim(2, "second")], total: 2, page: 2, page_size: 10 });
    await act(async () => root.render(<ExchangeReceivedClaims language="zh" postId="41" />));
    await waitFor(() => expect(document.body.textContent).toContain("服务者 1"));

    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="load-more-claims"]')!.click());
    await waitFor(() => expect(document.body.textContent).toContain("服务者 2"));

    expect(document.body.textContent).toContain("服务者 1");
    expect(listReceivedExchangeClaims).toHaveBeenLastCalledWith("41", { page: 2, pageSize: 10 });
  });
});
