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
import type { ExchangeCancellation, ExchangeCancellationAction } from "./types";

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
}

async function renderPanel(props: {
  onCancellationChange?: (payload: ExchangeCancellation) => void;
  onLinkedChange?: (linked: boolean | null) => void;
} = {}) {
  await act(async () => root.render(
    <ExchangeOrderCancellationPanel language="zh" orderId={501} {...props} />
  ));
  await flush();
}

async function enterReason(value: string) {
  const reason = container.querySelector<HTMLTextAreaElement>("textarea");
  expect(reason).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(reason, value);
    reason!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickAction(action: ExchangeCancellationAction) {
  const target = container.querySelector<HTMLButtonElement>(`[data-action="${action}-exchange-cancellation"]`);
  expect(target).not.toBeNull();
  await act(async () => target!.click());
  await flush();
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

  it("renders no cancellation or ordinary-order actions while the contract lookup is loading", async () => {
    const lookup = deferred<ExchangeCancellation>();
    const onLinkedChange = vi.fn();
    vi.mocked(getExchangeCancellation).mockReturnValue(lookup.promise);

    await act(async () => root.render(
      <ExchangeOrderCancellationPanel language="zh" onLinkedChange={onLinkedChange} orderId={501} />
    ));

    expect(container.innerHTML).toBe("");
    expect(onLinkedChange).toHaveBeenLastCalledWith(null);

    lookup.resolve(available);
    await flush();
    expect(container.textContent).toContain(exchangeText("cancellationTitle", "zh"));
    expect(onLinkedChange).toHaveBeenLastCalledWith(true);
  });

  it.each([403, 500])("fails closed for a non-404 contract error (%s)", async (status) => {
    const onLinkedChange = vi.fn();
    vi.mocked(getExchangeCancellation).mockRejectedValue(
      new ApiClientError("error.exchange.cancellation_unavailable", 50042, status)
    );

    await renderPanel({ onLinkedChange });

    expect(container.querySelector('[data-testid="exchange-order-cancellation"]')?.getAttribute("role")).toBe("alert");
    expect(container.textContent).toContain(exchangeText("cancellationLoadFailed", "zh"));
    expect(onLinkedChange).toHaveBeenCalledWith(null);
    expect(onLinkedChange).not.toHaveBeenCalledWith(false);
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

    await renderPanel();
    await enterReason("  无法按约定时间提供服务  ");
    await clickAction("request");

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
    const onCancellationChange = vi.fn();
    const accepted: ExchangeCancellation = {
      ...pendingForOtherParty,
      orderStatus: "cancelled",
      allowedActions: [],
      cancellation: { ...pendingForOtherParty.cancellation!, status: "accepted", version: 4, resolvedAt: "2026-09-05T03:05:00.000Z" }
    };
    vi.mocked(getExchangeCancellation).mockResolvedValue(pendingForOtherParty);
    vi.mocked(decideExchangeCancellation).mockResolvedValue(accepted);

    await renderPanel({ onCancellationChange });

    expect(document.body.textContent).toContain("只取消这张订单");
    expect(document.body.textContent).toContain("发布费");
    await clickAction("accept");

    expect(decideExchangeCancellation).toHaveBeenCalledWith(
      501,
      "accept",
      3,
      "123e4567-e89b-42d3-a456-426614174091"
    );
    expect(document.body.textContent).toContain("双方已同意取消");
    expect(onCancellationChange).toHaveBeenLastCalledWith(accepted);
  });

  it.each([
    ["reject", "rejected", "cancellationRejected"],
    ["withdraw", "withdrawn", "cancellationWithdrawn"]
  ] as const)("applies the server-authorized %s decision and keeps its persisted terminal record", async (action, status, label) => {
    const source: ExchangeCancellation = action === "withdraw"
      ? {
          ...pendingForOtherParty,
          viewerParty: "customer",
          allowedActions: ["withdraw"]
        }
      : pendingForOtherParty;
    const resolved: ExchangeCancellation = {
      ...source,
      allowedActions: ["request"],
      cancellation: {
        ...source.cancellation!,
        status,
        version: 4,
        resolvedAt: "2026-09-05T03:05:00.000Z"
      }
    };
    vi.mocked(getExchangeCancellation).mockResolvedValue(source);
    vi.mocked(decideExchangeCancellation).mockResolvedValue(resolved);

    await renderPanel();
    await clickAction(action);

    expect(decideExchangeCancellation).toHaveBeenCalledWith(
      501,
      action,
      3,
      "123e4567-e89b-42d3-a456-426614174091"
    );
    expect(container.textContent).toContain(exchangeText(label, "zh"));
  });

  it("refreshes the persisted snapshot after a 409 conflict", async () => {
    const refreshed: ExchangeCancellation = {
      ...available,
      allowedActions: ["withdraw"],
      cancellation: {
        id: 92,
        status: "pending",
        reason: "另一设备已提交的原因",
        initiatorParty: "customer",
        version: 2,
        requestedAt: "2026-09-05T04:00:00.000Z",
        resolvedAt: null
      }
    };
    vi.mocked(getExchangeCancellation)
      .mockResolvedValueOnce(available)
      .mockResolvedValueOnce(refreshed);
    vi.mocked(createExchangeCancellationRequest).mockRejectedValue(
      new ApiClientError("error.exchange.cancellation_version_conflict", 40942, 409)
    );

    await renderPanel();
    await enterReason("当前设备的原因");
    await clickAction("request");

    expect(getExchangeCancellation).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("另一设备已提交的原因");
    expect(container.querySelector('[data-action="withdraw-exchange-cancellation"]')).not.toBeNull();
  });

  it.each([
    ["network", new Error("network lost")],
    ["server", new ApiClientError("error.exchange.cancellation_unavailable", 50342, 503)]
  ])("reuses the same idempotency key when an identical %s-failed request is retried", async (_kind, failure) => {
    const randomUUID = vi.fn()
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174091")
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174092");
    vi.stubGlobal("crypto", { randomUUID });
    const pending: ExchangeCancellation = {
      ...available,
      allowedActions: ["withdraw"],
      cancellation: {
        id: 93,
        status: "pending",
        reason: "保持相同语义",
        initiatorParty: "customer",
        version: 1,
        requestedAt: "2026-09-05T04:10:00.000Z",
        resolvedAt: null
      }
    };
    vi.mocked(getExchangeCancellation).mockResolvedValue(available);
    vi.mocked(createExchangeCancellationRequest)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(pending);

    await renderPanel();
    await enterReason("保持相同语义");
    await clickAction("request");
    await clickAction("request");

    expect(createExchangeCancellationRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createExchangeCancellationRequest).mock.calls[1]?.[2]).toBe(
      vi.mocked(createExchangeCancellationRequest).mock.calls[0]?.[2]
    );
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
