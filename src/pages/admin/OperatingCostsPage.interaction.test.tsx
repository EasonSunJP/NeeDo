// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatingCostsPage } from "./OperatingCostsPage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  canWrite: false,
  listOperatingCosts: vi.fn(),
  createOperatingCost: vi.fn(),
  updateOperatingCost: vi.fn(),
  publishOperatingCost: vi.fn(),
  deleteOperatingCost: vi.fn(),
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === "backoffice:operating-cost:write" && testState.canWrite,
  }),
}));

vi.mock("../../api/platformPartners", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/platformPartners")>()),
  platformPartnersApi: {
    listOperatingCosts: testState.listOperatingCosts,
    createOperatingCost: testState.createOperatingCost,
    updateOperatingCost: testState.updateOperatingCost,
    publishOperatingCost: testState.publishOperatingCost,
    deleteOperatingCost: testState.deleteOperatingCost,
  },
}));

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({
    actions,
    children,
    description,
    title,
  }: {
    actions: ReactNode;
    children: ReactNode;
    description: string;
    title: string;
  }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  ),
}));

const cost = (status: "draft" | "published" = "published") => ({
  publicId: "cost-1",
  costCode: "server.monthly",
  version: 1,
  categoryCode: "server" as const,
  name: "服务器成本",
  amountJpy: 100_000,
  currency: "JPY" as const,
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-09-30T00:00:00.000Z",
  allocationMode: "equal_active_shops" as const,
  status,
  effectiveAt: "2026-09-01T00:00:00.000Z",
  publishedAt:
    status === "published" ? "2026-09-01T00:00:00.000Z" : null,
  configuredById: 1,
  reason: "九月服务器账单",
  directAssignments: null,
  allocations:
    status === "published"
      ? [
          {
            shopPublicId: "shop0000000001",
            shopName: "银座护理店",
            amountJpy: 60_000,
            allocationWeight: null,
          },
          {
            shopPublicId: "shop0000000002",
            shopName: "涩谷护理店",
            amountJpy: 40_000,
            allocationWeight: null,
          },
        ]
      : [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
});

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

function fillByPlaceholder(placeholder: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!input) throw new Error(`missing input: ${placeholder}`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fieldValue(labelText: string) {
  const label = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.includes(labelText),
  );
  return (
    label?.querySelector("input, textarea, select") as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null
  )?.value;
}

function fillField(labelText: string, value: string) {
  const label = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input, textarea, select") as
    | HTMLInputElement
    | HTMLTextAreaElement
    | HTMLSelectElement
    | null;
  if (!input) throw new Error(`missing field: ${labelText}`);
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(buttonText: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.includes(buttonText),
  );
  if (!button) throw new Error(`missing button: ${buttonText}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

describe("OperatingCostsPage formal interactions", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    testState.canWrite = false;
    testState.listOperatingCosts.mockResolvedValue({
      list: [cost()],
      total: 1,
      page: 1,
      page_size: 20,
    });
    testState.createOperatingCost.mockResolvedValue(cost("draft"));
    testState.updateOperatingCost.mockResolvedValue(cost("draft"));
    testState.publishOperatingCost.mockResolvedValue(cost("published"));
    testState.deleteOperatingCost.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows persisted allocation evidence while keeping read-only users non-mutating", async () => {
    act(() => root.render(<OperatingCostsPage />));
    await waitFor(() => expect(container.textContent).toContain("服务器成本"));

    expect(container.textContent).toContain("银座护理店 · ¥60,000");
    expect(container.textContent).toContain("涩谷护理店 · ¥40,000");
    expect(container.textContent).toContain("当前账号只有读取权限");
    expect(container.textContent).not.toContain("新建运营成本草稿");
    expect(testState.publishOperatingCost).not.toHaveBeenCalled();
  });

  it("publishes a draft through the formal API only after an operation reason", async () => {
    testState.canWrite = true;
    testState.listOperatingCosts.mockResolvedValue({
      list: [cost("draft")],
      total: 1,
      page: 1,
      page_size: 20,
    });
    act(() => root.render(<OperatingCostsPage />));
    await waitFor(() => expect(container.textContent).toContain("服务器成本"));

    await click("发布并分摊");
    expect(testState.publishOperatingCost).not.toHaveBeenCalled();
    expect(container.textContent).toContain("发布或撤回前必须填写操作理由");
    expect(container.textContent).toContain("服务器成本");

    fillByPlaceholder("发布或撤回理由（必填）", "财务账单已复核");
    testState.publishOperatingCost.mockRejectedValueOnce(
      new Error("成本版本冲突"),
    );
    await click("发布并分摊");
    await waitFor(() => expect(container.textContent).toContain("成本版本冲突"));
    expect(container.textContent).toContain("服务器成本");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[placeholder="发布或撤回理由（必填）"]',
      )?.value,
    ).toBe("财务账单已复核");

    await click("发布并分摊");
    await waitFor(() =>
      expect(testState.publishOperatingCost).toHaveBeenCalledWith(
        "cost-1",
        "财务账单已复核",
      ),
    );
    expect(testState.publishOperatingCost).toHaveBeenCalledTimes(2);
    expect(testState.listOperatingCosts).toHaveBeenCalledTimes(2);
  });

  it("keeps an edited cost draft retryable after the formal API rejects it", async () => {
    testState.canWrite = true;
    testState.listOperatingCosts.mockResolvedValue({
      list: [cost("draft")],
      total: 1,
      page: 1,
      page_size: 20,
    });
    testState.updateOperatingCost
      .mockRejectedValueOnce(new Error("草稿版本冲突"))
      .mockResolvedValueOnce(cost("draft"));
    act(() => root.render(<OperatingCostsPage />));
    await waitFor(() => expect(container.textContent).toContain("服务器成本"));

    await click("编辑");
    expect(fieldValue("成本代码")).toBe("server.monthly");
    expect(fieldValue("设置理由")).toBe("九月服务器账单");
    fillField("金额 JPY", "125000");
    fillField("设置理由", "调高服务器预算");
    await click("保存草稿");
    await waitFor(() => expect(container.textContent).toContain("草稿版本冲突"));
    expect(fieldValue("成本代码")).toBe("server.monthly");
    expect(fieldValue("金额 JPY")).toBe("125000");
    expect(fieldValue("设置理由")).toBe("调高服务器预算");

    await click("保存草稿");
    await waitFor(() =>
      expect(testState.updateOperatingCost).toHaveBeenCalledTimes(2),
    );
    for (const callNumber of [1, 2]) {
      expect(testState.updateOperatingCost).toHaveBeenNthCalledWith(
        callNumber,
        "cost-1",
        expect.objectContaining({
          amountJpy: 125_000,
          reason: "调高服务器预算",
        }),
      );
    }
  });
});
