// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserManagementWorkspace } from "./UserManagementWorkspace";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  allowTestAccountUpdate: true,
  assignUserRoles: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  disableUser: vi.fn(),
  enableUser: vi.fn(),
  listPermissions: vi.fn(),
  listRoles: vi.fn(),
  listUsers: vi.fn(),
  updateTestAccount: vi.fn()
}));

vi.mock("../../auth/PermissionGate", () => ({
  PermissionGate: ({ children, permission }: { children: ReactNode; permission?: string }) =>
    permission === "button:user:test-account:update" && !testState.allowTestAccountUpdate
      ? null
      : children
}));

vi.mock("../../components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => children
}));

vi.mock("../../components/admin/ModuleShell", () => ({
  ModuleShell: ({ actions, children, description, title }: { actions: ReactNode; children: ReactNode; description: string; title: string }) => (
    <main>
      <h1>{title}</h1>
      <p>{description}</p>
      {actions}
      {children}
    </main>
  )
}));

vi.mock("../../i18n/I18nProvider", () => ({
  useI18n: () => ({ language: "zh" })
}));

vi.mock("../../api/userManagement", () => ({
  userManagementApi: {
    assignUserRoles: testState.assignUserRoles,
    createUser: testState.createUser,
    deleteUser: testState.deleteUser,
    disableUser: testState.disableUser,
    enableUser: testState.enableUser,
    listPermissions: testState.listPermissions,
    listRoles: testState.listRoles,
    listUsers: testState.listUsers,
    updateTestAccount: testState.updateTestAccount
  }
}));

const testUser = {
  id: 41,
  email: "test@example.com",
  phone: null,
  username: "测试用户",
  avatarUrl: null,
  isActive: true,
  isTestAccount: true,
  balances: {
    ndp: { available: 0, frozen: 0 },
    testNdp: { available: 100_000, frozen: 0 }
  },
  lastLoginAt: null,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  deletedAt: null,
  roleAssignments: [],
  roles: []
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
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

async function renderWorkspace() {
  await act(async () => {
    root.render(<UserManagementWorkspace mode="users" />);
  });
  await waitFor(() => expect(container.textContent).toContain("测试用户"));
}

describe("UserManagementWorkspace Test NDP account controls", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    testState.allowTestAccountUpdate = true;
    testState.listUsers.mockResolvedValue({ list: [testUser], total: 1, page: 1, page_size: 20 });
    testState.listRoles.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
    testState.listPermissions.mockResolvedValue({ list: [], total: 0, page: 1, page_size: 100 });
    testState.updateTestAccount.mockResolvedValue({ ...testUser, isTestAccount: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows classification, dual balances, server filter, and optimistic mutation", async () => {
    await renderWorkspace();

    expect(container.textContent).toContain("测试账号");
    expect(container.textContent).toContain("100,000 Test NDP");
    expect(container.textContent).toContain("0 NDP");

    const filter = container.querySelector<HTMLSelectElement>('select[aria-label="账号类型"]');
    expect(filter).not.toBeNull();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(filter, "false");
      filter?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waitFor(() =>
      expect(testState.listUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ isTestAccount: false, page: 1, pageSize: 20 })
      )
    );

    const action = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("标记为正式账号")
    );
    expect(action).toBeDefined();
    await act(async () => {
      action?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() =>
      expect(testState.updateTestAccount).toHaveBeenCalledWith(41, {
        isTestAccount: false,
        expectedUpdatedAt: "2026-08-30T00:00:00.000Z"
      })
    );
  });

  it("hides the classification action without its button permission", async () => {
    testState.allowTestAccountUpdate = false;
    await renderWorkspace();

    expect(container.textContent).not.toContain("标记为正式账号");
  });

  it("keeps the server-paginated account list navigable", async () => {
    testState.listUsers.mockImplementation(async (query: { page: number }) => ({
      list: [{ ...testUser, id: query.page, email: `page-${query.page}@example.com` }],
      total: 41,
      page: query.page,
      page_size: 20
    }));
    await renderWorkspace();

    const next = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "下一页"
    );
    expect(next).toBeDefined();
    await act(async () => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() =>
      expect(testState.listUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, pageSize: 20 })
      )
    );
    expect(container.textContent).toContain("第 2 / 3 页");
  });
});
