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
  experience: { currentLevel: 1, totalExpUnits: "40000" },
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

  it("shows technician and merchant personal names without duplicating the customer or shop name", () => {
    act(() => root.render(<UnifiedUserTable language="zh" onQueryChange={vi.fn()} onSelect={vi.fn()} query={{}} rows={[{ ...row,
      identities: [...row.identities, { type: "merchant", displayName: "SHOP NAME", scopeType: "shop", scopeId: 1 }],
      identityProfiles: [ { type: "technician", status: "active", displayName: "林 小雨" }, { type: "merchant", status: "active", displayName: "佐藤 美咲" } ]
    }]} />));
    const cells = container.querySelectorAll("tbody td");
    expect(cells[0].textContent).toContain(row.displayName);
    expect(cells[3].textContent).toBe("技师：林 小雨商户：佐藤 美咲");
    expect(container.textContent).not.toContain("SHOP NAME");
    expect(container.textContent).not.toContain(row.username);
  });

  it.each([ ["not_enabled", "未开启"], ["under_review", "审核中"], ["rejected", "拒绝"] ] as const)("shows identity status %s", (status, label) => {
    act(() => root.render(<UnifiedUserTable language="zh" onQueryChange={vi.fn()} onSelect={vi.fn()} query={{}} rows={[{ ...row,
      identityProfiles: [ { type: "technician", status, displayName: null }, { type: "merchant", status, displayName: null } ]
    }]} />));
    expect(container.querySelectorAll("tbody td")[3].textContent).toBe(`技师：${label}商户：${label}`);
  });

  it.each([undefined, []])("omits retired scout identity badges and filter options", (identityProfiles) => {
    act(() => root.render(<UnifiedUserTable language="zh" onQueryChange={vi.fn()} onSelect={vi.fn()} query={{}} rows={[{ ...row,
      identities: [{ type: "scout", displayName: "星探旧身份", scopeId: null, scopeType: null }], identityProfiles
    }]} />));
    expect(container.querySelectorAll("tbody td")[3].textContent).not.toContain("星探");
    act(() => container.querySelectorAll<HTMLButtonElement>(".needo-table-filter-trigger")[3].click());
    expect(document.body.textContent).not.toContain("星探");
  });

  it("turns booking header ranges into a server query and resets pagination", () => {
    expect(bookingRangeQuery({ page: 4, page_size: 20 }, "10-50")).toEqual({
      page: 1,
      page_size: 20,
      minBookings: 10,
      maxBookings: 50
    });
  });

  it.each([2500, 0, null])("shows a separate secondary TestNDP balance only when nonzero: %s", (amount) => {
    act(() => root.render(<UnifiedUserTable language="zh" onQueryChange={vi.fn()} onSelect={vi.fn()} query={{}}
      rows={[{ ...row, testNdpBalance: amount === null ? null : { available: amount, frozen: 0 } }]} />));
    const balanceCell = container.querySelectorAll("tbody td")[8];
    expect(balanceCell.textContent).toContain("400");
    if (amount) {
      expect(balanceCell.querySelector("p")?.textContent).toBe("TestNDP 2,500");
      expect(balanceCell.querySelector("p")?.className).toContain("text-xs");
    } else expect(balanceCell.textContent).not.toContain("TestNDP");
  });

  it.each([[8, "ndpBalance"], [5, "bookingCount"]])("sorts numeric column %s across server pages", (index, sortBy) => {
    const onQueryChange = vi.fn();
    act(() => root.render(<UnifiedUserTable language="zh" onQueryChange={onQueryChange} onSelect={vi.fn()} query={{ page: 3, city: "Tokyo" }} rows={[row]} />));
    act(() => container.querySelectorAll<HTMLButtonElement>(".needo-table-filter-trigger")[Number(index)].click());
    for (const [label, sortDirection] of [["从大到小", "desc"], ["从小到大", "asc"]]) {
      const button = [...document.body.querySelectorAll("button")].find((node) => node.textContent === label);
      expect(button).toBeDefined();
      act(() => button!.click());
      expect(onQueryChange).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, city: "Tokyo", sortBy, sortDirection }));
    }
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
