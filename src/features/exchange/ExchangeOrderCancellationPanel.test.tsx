// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import {
  createExchangeCancellationRequest,
  decideExchangeCancellation,
  getExchangeCancellation
} from "./api";
import { ExchangeOrderCancellationPanel } from "./ExchangeOrderCancellationPanel";
import { exchangeText, type ExchangeTextKey } from "./i18n";
import type { ExchangeCancellation } from "./types";

vi.mock("./api", () => ({
  createExchangeCancellationRequest: vi.fn(),
  decideExchangeCancellation: vi.fn(),
  getExchangeCancellation: vi.fn()
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const available: ExchangeCancellation = {
  orderId: 501,
  orderStatus: "confirmed",
  viewerParty: "customer",
  allowedActions: ["request"],
  cancellation: null
};

const pendingForOtherParty: ExchangeCancellation = {
  ...available,
  viewerParty: "provider",
  allowedActions: ["accept", "reject"],
  cancellation: {
    id: 91,
    status: "pending",
    reason: "顾客无法按约定时间到达",
    initiatorParty: "customer",
    version: 3,
    requestedAt: "2026-09-05T03:00:00.000Z",
    resolvedAt: null
  }
};

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
}

describe("ExchangeOrderCancellationPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.resetAllMocks();
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "123e4567-e89b-42d3-a456-426614174091") });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("provides every cancellation control and impact message in all five app languages", () => {
    const keys = [
      "cancellationTitle",
      "cancellationIntro",
      "cancellationReason",
      "cancellationRequest",
      "cancellationWaiting",
      "cancellationAccept",
      "cancellationReject",
      "cancellationWithdraw",
      "cancellationImpact",
      "cancellationLoadFailed",
      "cancellationMutationFailed"
    ] satisfies ExchangeTextKey[];

    for (const language of ["ja", "en", "ko", "zh-Hant", "zh"] as const) {
      for (const key of keys) expect(exchangeText(key, language).trim()).not.toBe("");
    }
  });

  it("hides itself and reports an ordinary order when the Exchange contract returns 404", async () => {
    const onLinkedChange = vi.fn();
    vi.mocked(getExchangeCancellation).mockRejectedValue(
      new ApiClientError("error.exchange.cancellation_not_found", 40442, 404)
    );

    await act(async () => root.render(
      <ExchangeOrderCancellationPanel language="zh" onLinkedChange={onLinkedChange} orderId={501} />
    ));
    await flush();

    expect(container.innerHTML).toBe("");
    expect(onLinkedChange).toHaveBeenLastCalledWith(false);
  });

  it("submits the reason with version zero and retains server-returned pending state", async () => {
    vi.mocked(getExchangeCancellation).mockResolvedValue(available);
    vi.mocked(createExchangeCancellationRequest).mockResolvedValue({
      ...available,
      allowedActions: ["withdraw"],
      cancellation: {
        id: 91,
        status: "pending",
        reason: "无法按约定时间提供服务",
        initiatorParty: "customer",
        version: 1,
        requestedAt: "2026-09-05T03:00:00.000Z",
        resolvedAt: null
      }
    });

    await act(async () => root.render(
      <ExchangeOrderCancellationPanel language="zh" orderId={501} />
    ));
    await flush();
    const reason = document.body.querySelector<HTMLTextAreaElement>("textarea");
    expect(reason).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(
        reason,
        "  无法按约定时间提供服务  "
      );
      reason!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="request-exchange-cancellation"]')!.click());
    await flush();

    expect(createExchangeCancellationRequest).toHaveBeenCalledWith(
      501,
      { expectedVersion: 0, reason: "无法按约定时间提供服务" },
      "123e4567-e89b-42d3-a456-426614174091"
    );
    expect(document.body.textContent).toContain("等待对方答复");
    expect(document.body.textContent).toContain("无法按约定时间提供服务");
    expect(document.body.querySelector('[data-action="withdraw-exchange-cancellation"]')).not.toBeNull();
  });

  it("shows the per-order financial impact and accepts the other party's exact pending version", async () => {
    vi.mocked(getExchangeCancellation).mockResolvedValue(pendingForOtherParty);
    vi.mocked(decideExchangeCancellation).mockResolvedValue({
      ...pendingForOtherParty,
      orderStatus: "cancelled",
      allowedActions: [],
      cancellation: { ...pendingForOtherParty.cancellation!, status: "accepted", version: 4, resolvedAt: "2026-09-05T03:05:00.000Z" }
    });

    await act(async () => root.render(
      <ExchangeOrderCancellationPanel language="zh" orderId={501} />
    ));
    await flush();

    expect(document.body.textContent).toContain("只取消这张订单");
    expect(document.body.textContent).toContain("发布费");
    await act(async () => document.body.querySelector<HTMLButtonElement>('[data-action="accept-exchange-cancellation"]')!.click());
    await flush();

    expect(decideExchangeCancellation).toHaveBeenCalledWith(
      501,
      "accept",
      3,
      "123e4567-e89b-42d3-a456-426614174091"
    );
    expect(document.body.textContent).toContain("双方已同意取消");
  });
});
