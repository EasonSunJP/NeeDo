// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAccountMenu } from "./AdminAccountMenu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const authMock = vi.hoisted(() => ({
  logout: vi.fn(),
  session: {
    portal: "admin",
    username: "formal_operator",
    email: "operator@needo.life",
    loginMethod: "password"
  }
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => authMock
}));

let container: HTMLDivElement;
let root: Root;

describe("AdminAccountMenu", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows the formal session account instead of demo fallback credentials", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AdminAccountMenu
            accountName="管理员用户端姓名"
            loginPath="/login/admin"
            portal="admin"
            roleLabel="东京运营组"
          />
        </MemoryRouter>
      );
    });
    await act(async () => container.querySelector("button")?.click());

    expect(container.textContent).toContain("管理员用户端姓名");
    expect(container.textContent).toContain("formal_operator");
    expect(container.textContent).toContain("operator@needo.life");
    expect(container.textContent).not.toContain("admin@example.com");
  });
});
