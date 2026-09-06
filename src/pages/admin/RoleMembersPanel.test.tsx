// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleMembersPanel } from "./RoleMembersPanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({ listUsers: vi.fn() }));

vi.mock("../../api/userManagement", () => ({
  userManagementApi: { listUsers: testState.listUsers }
}));

const role = {
  id: 7,
  name: "运营人员",
  code: "operator",
  description: null,
  isSystem: true,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  deletedAt: null,
  permissions: []
};

const user = {
  id: 41,
  email: "operator@example.com",
  phone: null,
  username: "运营甲",
  avatarUrl: null,
  isActive: true,
  isTestAccount: false,
  balances: { ndp: { available: 0, frozen: 0 }, testNdp: { available: 0, frozen: 0 } },
  lastLoginAt: null,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  deletedAt: null,
  roleAssignments: [
    { id: 2, roleId: 7, code: "operator", name: "运营人员", scopeType: "merchant", scopeId: 18 }
  ],
  roles: ["operator"]
};

const copy = {
  active: "启用",
  disabled: "停用",
  empty: "该角色暂无人员",
  loading: "加载中",
  members: "人员列表",
  nextPage: "下一页",
  previousPage: "上一页",
  retry: "重试",
  scope: "范围",
  pageSummary: (page: number, totalPages: number) => `第 ${page} / ${totalPages} 页`
};

let container: HTMLDivElement;
let root: Root;

async function waitFor(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

describe("RoleMembersPanel", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    testState.listUsers.mockResolvedValue({ list: [user], total: 21, page: 1, page_size: 20 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("loads active role members only when expanded and keeps server pagination", async () => {
    await act(async () => root.render(<RoleMembersPanel copy={copy} role={role} />));
    expect(testState.listUsers).not.toHaveBeenCalled();

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    await act(async () => {
      if (details) details.open = true;
      details?.dispatchEvent(new Event("toggle", { bubbles: true }));
    });

    await waitFor(() =>
      expect(testState.listUsers).toHaveBeenCalledWith({ roleId: 7, page: 1, pageSize: 20 })
    );
    expect(container.textContent).toContain("运营甲");
    expect(container.textContent).toContain("operator@example.com");
    expect(container.textContent).toContain("范围：merchant:18");

    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "下一页"
    );
    await act(async () => next?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await waitFor(() =>
      expect(testState.listUsers).toHaveBeenLastCalledWith({ roleId: 7, page: 2, pageSize: 20 })
    );
  });
});
