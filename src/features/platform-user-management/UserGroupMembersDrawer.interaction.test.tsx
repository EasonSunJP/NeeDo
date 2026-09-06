// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { UserGroupMembersDrawer } from "./UserGroupMembersDrawer";
import type { UserGroup } from "./types";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state = vi.hoisted(() => ({ permissions: ["user:create", "user:assign-role"], listGroupMembers: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ hasPermission: (code: string) => state.permissions.includes(code) }) }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
vi.mock("./api", () => ({ platformUserManagementApi: state }));
vi.mock("./UnifiedUserDetailDrawer", () => ({ UnifiedUserDetailDrawer: ({ userId, onClose, scope, layer }: { userId: number; onClose: () => void; scope: string; layer: string }) => <div data-detail={`${scope}-${userId}-${layer}`}><button onClick={onClose}>关闭详情</button></div> }));
vi.mock("../../components/ui/Drawer", () => ({ Drawer: ({ children, headerActions }: { children: ReactNode; headerActions: ReactNode }) => <section>{headerActions}{children}</section> }));
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); state.permissions = ["user:create", "user:assign-role"]; vi.clearAllMocks(); });
const group: UserGroup = { code: "system:operations", kind: "system", name: "运营成员", description: null, status: "active", mutableName: false, memberCount: 21 };
it("opens the shared detail for the actual member and returns to the same group page", async () => {
  state.listGroupMembers.mockImplementation(async (_code: string, query: { page: number }) => ({ page: query.page, page_size: 20, total: 21, list: [{ id: query.page === 1 ? 41 : 42, needoId: "needo1234567890", username: "Operator", email: "o@example.test", avatarUrl: null }] }));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); cleanup = () => { act(() => root.unmount()); host.remove(); };
  await act(async () => root.render(<UserGroupMembersDrawer group={group} onClose={vi.fn()} onSaved={vi.fn()} />));
  const click = async (label: string) => act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === label)!.click());
  await click("下一页"); await click("详情");
  expect(host.querySelector('[data-detail="operations-42-overlay"]')).not.toBeNull();
  await click("关闭详情"); expect(host.textContent).toContain("2 / 2");
  expect(host.textContent).toContain("添加运营成员");
  state.permissions = ["user:create"];
  await act(async () => root.render(<UserGroupMembersDrawer group={group} onClose={vi.fn()} onSaved={vi.fn()} />));
  expect([...host.querySelectorAll("button")].some((button) => button.textContent === "添加运营成员")).toBe(false);
});
