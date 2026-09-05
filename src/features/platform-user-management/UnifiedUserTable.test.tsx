// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnifiedUserTable, bookingRangeQuery } from "./UnifiedUserTable";
import type { PlatformManagedUser } from "./types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: PlatformManagedUser = {
  id: 41,
  needoId: "u4083532147",
  username: "raw-account-name",
  displayName: "望月 結菜",
  email: "mia@example.test",
  phone: null,
  emailBound: true,
  phoneBound: false,
  avatarUrl: null,
  city: "Tokyo",
  privacyMode: true,
  privacyScope: "limited",
  isActive: true,
  isTestAccount: false,
  source: ["email"],
  identities: [{ type: "customer", displayName: "用户", scopeType: null, scopeId: null }],
  roles: [{ code: "customer", name: "普通用户" }],
  groups: [],
  ekycVerified: false,
  membership: {
    tierCode: "gold",
    tierVersionPublicId: null,
    entitlementPublicId: null,
    expiresAt: null,
    experienceMultiplier: 1.5,
    lockVersion: null
  },
  experience: { currentLevel: 2, totalExpUnits: "120" },
  ndpBalance: { available: 400, frozen: 0 },
  bookingCount: 12,
  lastLoginAt: null,
  createdAt: "2026-09-05T10:00:00.000Z",
  updatedAt: "2026-09-05T10:00:00.000Z"
};

describe("UnifiedUserTable", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the canonical list facts and localizes membership and privacy", () => {
    act(() => {
      root.render(
        <UnifiedUserTable
          language="zh"
          onQueryChange={vi.fn()}
          onSelect={vi.fn()}
          query={{ page: 1, page_size: 20 }}
          rows={[row]}
        />
      );
    });

    expect(container.textContent).toContain("mia@example.test");
    expect(container.textContent).toContain("Tokyo");
    expect(container.textContent).toContain("黄金会员");
    expect(container.textContent).toContain("已开启");
    expect(container.textContent).not.toContain("邮箱已绑定");
    expect(container.textContent).not.toContain("gold");
  });

  it("turns booking header ranges into a server query and resets pagination", () => {
    expect(bookingRangeQuery({ page: 4, page_size: 20 }, "10-50")).toEqual({
      page: 1,
      page_size: 20,
      minBookings: 10,
      maxBookings: 50
    });
  });

  it("does not offer sorting for columns without a supported server sort key", () => {
    act(() => {
      root.render(
        <UnifiedUserTable language="ja" onQueryChange={vi.fn()} onSelect={vi.fn()} query={{}} rows={[row]} />
      );
    });

    const identityTrigger = container.querySelectorAll<HTMLButtonElement>(".needo-table-filter-trigger")[3];
    act(() => identityTrigger?.click());

    expect(document.body.querySelectorAll(".needo-table-filter-sort-button")).toHaveLength(0);
    expect(document.body.textContent).toContain("フィルター");
    expect(document.body.textContent).toContain("自動適用");
    expect(document.body.textContent).toContain("フィルターを解除");
  });

  it("turns the registered-date header input into a stable server date range", () => {
    const onQueryChange = vi.fn();
    act(() => {
      root.render(
        <UnifiedUserTable language="zh" onQueryChange={onQueryChange} onSelect={vi.fn()} query={{}} rows={[row]} />
      );
    });
    const createdAtTrigger = container.querySelectorAll<HTMLButtonElement>(".needo-table-filter-trigger")[10];
    act(() => createdAtTrigger?.click());
    const fromInput = document.body.querySelector<HTMLInputElement>('input[aria-label="from"]');
    act(() => {
      if (!fromInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(fromInput, "2026-09-01");
      fromInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onQueryChange).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      registeredFrom: "2026-09-01T00:00:00.000Z"
    }));
  });
});
