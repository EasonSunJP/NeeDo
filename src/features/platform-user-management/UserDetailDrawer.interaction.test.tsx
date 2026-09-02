// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserDetailDrawer } from "./UserDetailDrawer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const testState = vi.hoisted(() => ({
  canMarkPartner: true,
  getUser: vi.fn(),
  markPartnerProfile: vi.fn(),
}));

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: () => ({
    hasPermission: (permission: string) =>
      permission === "backoffice:partner-profile:write" &&
      testState.canMarkPartner,
  }),
}));

vi.mock("../../api/platformPartners", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/platformPartners")>()),
  platformPartnersApi: {
    markPartnerProfile: testState.markPartnerProfile,
  },
}));

vi.mock("./api", () => ({
  platformUserManagementApi: {
    getUser: testState.getUser,
  },
}));

vi.mock("../../components/ui/Drawer", () => ({
  Drawer: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) =>
    open ? (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ) : null,
}));

vi.mock("./UserExperienceHistory", () => ({
  UserExperienceHistory: () => null,
}));

const user = {
  id: 41,
  username: "测试用户",
  needoId: "u0000000041",
  phoneBound: true,
  emailBound: true,
  ekycVerified: false,
  source: ["customer"],
  profile: {
    displayName: "测试用户",
    languages: ["日本語"],
    bio: "正式用户",
  },
  membership: {
    tierCode: "free",
    experienceMultiplier: 1,
  },
  experience: null,
  bookingSpend: {
    totalBookings: 2,
    completedBookings: 1,
    completedSpendJpy: 8_800,
  },
  ndpBalance: {
    available: 1_000,
  },
  account: {
    roles: [],
  },
  groups: [],
  audit: {
    list: [],
  },
};

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

function fill(labelText: string, value: string) {
  const label = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input") as HTMLInputElement | null;
  if (!input) throw new Error(`missing input: ${labelText}`);
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

describe("UserDetailDrawer partner marker interaction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    testState.canMarkPartner = true;
    testState.getUser.mockResolvedValue(user);
    testState.markPartnerProfile.mockResolvedValue({ publicId: "agent-1" });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("marks the selected formal user as an agent with effective-time evidence", async () => {
    act(() => root.render(<UserDetailDrawer onClose={vi.fn()} userId={41} />));
    await waitFor(() => expect(container.textContent).toContain("测试用户"));

    fill("标记理由", " 合同和身份已审核 ");
    await click("标记为代理商");

    await waitFor(() =>
      expect(testState.markPartnerProfile).toHaveBeenCalledWith(
        41,
        expect.objectContaining({
          partnerType: "agent",
          activatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          reason: "合同和身份已审核",
        }),
      ),
    );
    expect(container.textContent).toContain("代理商标记已保存");
  });

  it("keeps partner mutations unavailable without the exact permission", async () => {
    testState.canMarkPartner = false;
    act(() => root.render(<UserDetailDrawer onClose={vi.fn()} userId={41} />));
    await waitFor(() => expect(container.textContent).toContain("测试用户"));

    expect(container.textContent).toContain("当前账号没有标记合作方的权限");
    expect(container.textContent).not.toContain("标记为代理商");
    expect(testState.markPartnerProfile).not.toHaveBeenCalled();
  });
});
