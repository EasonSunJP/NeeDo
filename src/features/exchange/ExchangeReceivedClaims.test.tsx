// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listReceivedExchangeClaims } from "./api";
import { ExchangeReceivedClaims } from "./ExchangeReceivedClaims";
import type { ExchangeClaim } from "./types";

vi.mock("./api", () => ({ listReceivedExchangeClaims: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function claim(id: number, message: string): ExchangeClaim {
  return {
    id,
    exchangePostId: 41,
    status: "active",
    provider: { publicId: `NT000000${id}`, displayName: `服务者 ${id}`, avatarUrl: null },
    shop: { id: 7, name: "GINZA Calm Body Lab" },
    technician: { profileId: id, publicId: `NT000000${id}`, displayName: `技师 ${id}` },
    service: { ref: `technician:${id}`, name: `真实服务 ${id}`, durationMinutes: 60 },
    scheduleSlotId: 90 + id,
    quoteAmountJpy: 10_000 + id,
    currency: "JPY",
    message,
    estimatedStartsAt: "2026-09-02T04:00:00.000Z",
    estimatedEndsAt: "2026-09-02T05:00:00.000Z",
    createdAt: "2026-09-01T02:00:00.000Z",
    withdrawnAt: null,
    terminalAt: null
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
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
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
    expect(Array.from(document.body.querySelectorAll("button")).map((button) => button.textContent).join(" ")).not.toMatch(/选择|匹配|追加预算|预约|支付/u);
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
