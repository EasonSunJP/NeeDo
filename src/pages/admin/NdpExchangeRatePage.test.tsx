// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { ndpExchangeRateApi, type NdpExchangeRateOverview } from "../../api/ndpExchangeRate";
import { classifyNdpExchangeRate, NdpExchangeRatePage } from "./NdpExchangeRatePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mocked = vi.hoisted(() => ({ canWrite: true }));

vi.mock("../../api/ndpExchangeRate", () => ({
  ndpExchangeRateApi: { getOverview: vi.fn(), publish: vi.fn() }
}));
vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../../auth/PermissionGate", () => ({
  PermissionGate: ({ children, permission }: { children: ReactNode; permission?: string }) =>
    mocked.canWrite && permission === "backoffice:ndp-exchange-rate:write" ? <>{children}</> : null
}));

const rate = (overrides: Record<string, unknown> = {}) => {
  const version = typeof overrides.version === "number" ? overrides.version : 1;
  return ({
    ruleId: 1,
    publicId: `rate-${version}`,
    version: 1,
    ndpUnits: 3,
    jpyUnits: 5,
    status: "active" as const,
    effectiveFrom: "2026-08-01T00:00:00.000Z",
    effectiveTo: "2026-09-01T00:00:00.000Z",
    reason: "initial",
    createdById: 91,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides
  });
};

const overview = (overrides: Partial<NdpExchangeRateOverview> = {}): NdpExchangeRateOverview => ({
  current: rate({
    version: 2,
    status: "superseded",
    effectiveFrom: "2026-09-01T00:00:00.000Z",
    effectiveTo: "2026-10-01T00:00:00.000Z"
  }),
  nextScheduled: rate({
    version: 3,
    status: "superseded",
    effectiveFrom: "2026-10-01T00:00:00.000Z",
    effectiveTo: null
  }),
  latestVersion: 3,
  evaluatedAt: "2026-09-15T00:00:00.000Z",
  history: {
    list: [
      rate({ version: 3, status: "superseded", effectiveFrom: "2026-10-01T00:00:00.000Z", effectiveTo: null }),
      rate({ version: 2, status: "superseded", effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: "2026-10-01T00:00:00.000Z" }),
      rate({ version: 1, status: "active", effectiveFrom: "2026-08-01T00:00:00.000Z", effectiveTo: "2026-09-01T00:00:00.000Z" })
    ],
    total: 23,
    page: 1,
    page_size: 20
  },
  ...overrides
});

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function getButton(buttonText: string): HTMLButtonElement {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.includes(buttonText));
  if (!button) throw new Error(`missing button: ${buttonText}`);
  return button;
}

function click(buttonText: string) {
  const button = getButton(buttonText);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function hasButton(buttonText: string) {
  return [...document.querySelectorAll("button")].some((item) => item.textContent?.includes(buttonText));
}

function fill(labelText: string, value: string) {
  const label = [...document.querySelectorAll("label")].find((item) => item.textContent?.includes(labelText));
  const input = label?.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
  if (!input) throw new Error(`missing input: ${labelText}`);
  const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("NdpExchangeRatePage", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocked.canWrite = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("uses dedicated current/next fields and classifies history against evaluatedAt", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview());
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 20 });
    expect(container.textContent).toContain("当前生效");
    expect(container.textContent).toContain("下一计划");
    expect(container.textContent).toContain("3 NDP = 5 JPY");
    expect(container.querySelectorAll('[data-temporal-state="scheduled"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-temporal-state="current"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-temporal-state="historical"]')).toHaveLength(1);

    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(2, {
      page: 2,
      pageSize: 20,
      at: "2026-09-15T00:00:00.000Z"
    });
  });

  it("renders loading and authoritative empty states without creating fallback rates", async () => {
    let resolveOverview: ((value: NdpExchangeRateOverview) => void) | undefined;
    vi.mocked(ndpExchangeRateApi.getOverview).mockReturnValue(
      new Promise((resolve) => { resolveOverview = resolve; })
    );
    act(() => { root.render(<NdpExchangeRatePage />); });
    expect(container.textContent).toContain("正在加载汇率数据");
    await act(async () => {
      resolveOverview?.(overview({
        current: null,
        nextScheduled: null,
        latestVersion: 0,
        history: { list: [], total: 0, page: 1, page_size: 20 }
      }));
    });

    expect(container.textContent).toContain("当前没有生效汇率");
    expect(container.textContent).toContain("当前没有计划中的汇率");
    expect(container.textContent).toContain("暂无汇率版本记录");
    expect(container.textContent).not.toContain("1 NDP = 1 JPY");
  });

  it("uses half-open effective intervals at the exact evaluated boundary", () => {
    const boundary = "2026-09-15T00:00:00.000Z";
    expect(classifyNdpExchangeRate(rate({ effectiveFrom: boundary, effectiveTo: null }), boundary)).toBe("current");
    expect(classifyNdpExchangeRate(rate({ effectiveFrom: "2026-09-01T00:00:00.000Z", effectiveTo: boundary }), boundary)).toBe("historical");
  });

  it("shows formal read failure with retry and hides publish controls without write permission", async () => {
    mocked.canWrite = false;
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(overview());
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    expect(container.textContent).toContain("汇率数据加载失败");
    expect(container.textContent).not.toContain("发布新汇率");
    click("重试");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("当前生效");
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(3, {
      page: 2,
      pageSize: 20,
      at: "2026-09-15T00:00:00.000Z"
    });
    expect(container.textContent).not.toContain("发布新汇率");
  });

  it("validates integers/reason and requires explicit confirmation before publishing", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview());
    vi.mocked(ndpExchangeRateApi.publish).mockResolvedValue(rate({ version: 4 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    click("发布新汇率");
    fill("NDP 数量", "3");
    fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04");
    fill("设置理由", "  季度调整  ");
    click("确认发布内容");

    expect(ndpExchangeRateApi.publish).not.toHaveBeenCalled();
    expect(container.textContent).toContain("3 NDP = 5 JPY");
    expect(container.textContent).toContain("季度调整");
    click("确认并发布");
    await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledWith(expect.objectContaining({
      ndpUnits: 3,
      jpyUnits: 5,
      expectedVersion: 3,
      effectiveFrom: new Date("2030-01-02T03:04").toISOString(),
      reason: "季度调整",
      idempotencyKey: expect.stringMatching(/^.{16,160}$/)
    }));
  });

  it("rejects out-of-range integers and accepts the exact 32-bit maximum", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview());
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();
    click("发布新汇率");
    fill("NDP 数量", "2147483648"); fill("JPY 数量", "5.5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "边界检查");
    click("确认发布内容");
    expect(container.textContent).toContain("NDP 数量必须是范围内的正整数");
    expect(container.textContent).not.toContain("确认并发布");

    fill("NDP 数量", "2147483647"); fill("JPY 数量", "2147483647");
    click("确认发布内容");
    expect(container.textContent).toContain("2147483647 NDP = 2147483647 JPY");
  });

  it("retains an ambiguous command key only while its full semantics stay unchanged", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview());
    vi.mocked(ndpExchangeRateApi.publish)
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(rate({ version: 4 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();
    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "季度调整");
    click("确认发布内容"); click("确认并发布"); await flush();
    const firstKey = vi.mocked(ndpExchangeRateApi.publish).mock.calls[0][0].idempotencyKey;

    click("确认并发布"); await flush();
    expect(vi.mocked(ndpExchangeRateApi.publish).mock.calls[1][0].idempotencyKey).toBe(firstKey);

    click("返回修改");
    fill("设置理由", "季度调整后修订");
    click("确认发布内容"); click("确认并发布"); await flush();
    expect(vi.mocked(ndpExchangeRateApi.publish).mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
  });

  it("surfaces a formal idempotency conflict without reporting fake success", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview).mockResolvedValue(overview());
    vi.mocked(ndpExchangeRateApi.publish).mockRejectedValue(
      new ApiClientError("error.idempotency_key_reused", 40961, 409)
    );
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();
    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "冲突检查");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(container.textContent).toContain("幂等键已用于其他发布内容");
    expect(container.textContent).toContain("确认并发布");
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft and refreshes without at on a version conflict without auto-resubmit", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(overview({ latestVersion: 4 }));
    vi.mocked(ndpExchangeRateApi.publish).mockRejectedValue(
      new ApiClientError("error.ndp_exchange_rate.conflict", 40963, 409)
    );
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();
    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "保留草稿");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 20 });
    expect(container.textContent).toContain("版本或生效时间链已变化");
    expect(container.textContent).toContain("保留草稿");
    expect(container.textContent).not.toContain("确认并发布");
  });

  it("offers projection-only retry after a successful publish refresh fails", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce(overview({ latestVersion: 4 }));
    vi.mocked(ndpExchangeRateApi.publish).mockResolvedValue(rate({ version: 4 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();
    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "只读刷新");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("发布已受理，但最新只读数据刷新失败");
    expect(container.textContent).not.toContain("发布新汇率");
    click("重试只读数据");
    await flush();
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(3, { page: 1, pageSize: 20 });
  });

  it("releases the applied-command projection lock after a fresh read and permits a second deliberate publish", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockResolvedValueOnce(overview({ latestVersion: 4 }))
      .mockResolvedValueOnce(overview({ latestVersion: 5 }));
    vi.mocked(ndpExchangeRateApi.publish)
      .mockResolvedValueOnce(rate({ version: 4 }))
      .mockResolvedValueOnce(rate({ version: 5 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "第一次发布");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(hasButton("发布新汇率")).toBe(true);

    click("发布新汇率");
    fill("生效时间", "2031-01-02T03:04"); fill("设置理由", "第二次发布");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(2);
    expect(ndpExchangeRateApi.publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedVersion: 4,
      reason: "第二次发布"
    }));
    expect(vi.mocked(ndpExchangeRateApi.publish).mock.calls[1][0].idempotencyKey)
      .not.toBe(vi.mocked(ndpExchangeRateApi.publish).mock.calls[0][0].idempotencyKey);
  });

  it("blocks pagination from superseding the mandatory fresh read after an applied publish", async () => {
    const freshProjection = deferred<NdpExchangeRateOverview>();
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockImplementationOnce(() => freshProjection.promise)
      .mockResolvedValueOnce(overview({ history: { ...overview().history, page: 2 } }));
    vi.mocked(ndpExchangeRateApi.publish).mockResolvedValueOnce(rate({ version: 4 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "等待正式投影");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);
    expect(getButton("下一页").disabled).toBe(true);
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);

    await act(async () => {
      freshProjection.resolve(overview({ latestVersion: 4 }));
      await freshProjection.promise;
    });
    await flush();

    expect(hasButton("发布新汇率")).toBe(true);
    expect(getButton("下一页").disabled).toBe(false);
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(3, {
      page: 2,
      pageSize: 20,
      at: "2026-09-15T00:00:00.000Z"
    });
  });

  it("blocks pagination from superseding the mandatory fresh read after a version conflict", async () => {
    const freshProjection = deferred<NdpExchangeRateOverview>();
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockImplementationOnce(() => freshProjection.promise)
      .mockResolvedValueOnce(overview({ history: { ...overview().history, page: 2 } }));
    vi.mocked(ndpExchangeRateApi.publish).mockRejectedValueOnce(
      new ApiClientError("error.ndp_exchange_rate.conflict", 40963, 409)
    );
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "冲突后等待投影");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);
    expect(getButton("下一页").disabled).toBe(true);
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);

    await act(async () => {
      freshProjection.resolve(overview({ latestVersion: 4 }));
      await freshProjection.promise;
    });
    await flush();

    expect(hasButton("确认发布内容")).toBe(true);
    expect(getButton("下一页").disabled).toBe(false);
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(3, {
      page: 2,
      pageSize: 20,
      at: "2026-09-15T00:00:00.000Z"
    });
  });

  it("keeps a version-conflict refresh lock after a failed GET until retry loads a fresh version", async () => {
    vi.mocked(ndpExchangeRateApi.getOverview)
      .mockResolvedValueOnce(overview())
      .mockRejectedValueOnce(new Error("conflict refresh failed"))
      .mockResolvedValueOnce(overview({ latestVersion: 4 }))
      .mockResolvedValueOnce(overview({ latestVersion: 5 }));
    vi.mocked(ndpExchangeRateApi.publish)
      .mockRejectedValueOnce(new ApiClientError("error.ndp_exchange_rate.conflict", 40963, 409))
      .mockResolvedValueOnce(rate({ version: 5 }));
    await act(async () => { root.render(<NdpExchangeRatePage />); });
    await flush();

    click("发布新汇率");
    fill("NDP 数量", "3"); fill("JPY 数量", "5");
    fill("生效时间", "2030-01-02T03:04"); fill("设置理由", "冲突后保留");
    click("确认发布内容"); click("确认并发布"); await flush();

    expect(container.textContent).toContain("版本冲突后最新数据刷新失败");
    expect(hasButton("发布新汇率")).toBe(false);
    expect(hasButton("确认发布内容")).toBe(false);
    expect(hasButton("确认并发布")).toBe(false);
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(1);

    expect(getButton("下一页").disabled).toBe(true);
    click("下一页");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenCalledTimes(2);
    expect(hasButton("确认发布内容")).toBe(false);

    click("重试只读数据");
    await flush();
    expect(ndpExchangeRateApi.getOverview).toHaveBeenNthCalledWith(3, { page: 1, pageSize: 20 });
    expect(hasButton("确认发布内容")).toBe(true);

    click("确认发布内容"); click("确认并发布"); await flush();
    expect(ndpExchangeRateApi.publish).toHaveBeenCalledTimes(2);
    expect(ndpExchangeRateApi.publish).toHaveBeenNthCalledWith(2, expect.objectContaining({
      expectedVersion: 4,
      reason: "冲突后保留"
    }));
  });
});
