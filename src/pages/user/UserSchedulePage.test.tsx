// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapCoreCustomerToCustomer } from "../../features/core-read/api";
import type { CustomerSelfProfile } from "../../features/core-read/customerProfileApi";
import { useCustomerSelfProfile } from "../../features/core-read/useCustomerSelfProfile";
import pageSource from "./UserSchedulePage.tsx?raw";
import { UserSchedulePage } from "./UserSchedulePage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../features/core-read/useCustomerSelfProfile", () => ({
  useCustomerSelfProfile: vi.fn()
}));

vi.mock("../../components/mobile/MobileShell", () => ({
  MobileShell: ({ children }: { children: ReactNode }) => <main>{children}</main>
}));

vi.mock("../../components/mobile/FloatingHomeHeader", () => ({
  FloatingHomeHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  floatingHeaderGlassPanelClassName: "",
  floatingHeaderInnerClassName: ""
}));

vi.mock("../../components/mobile/SharedHomeHeader", () => ({
  SharedHomeHeader: ({ avatarAlt, locationLabel }: { avatarAlt: string; locationLabel: string }) => (
    <div data-testid="formal-user-header">{avatarAlt} · {locationLabel}</div>
  )
}));

vi.mock("../../components/scheduling/ScheduleSearchField", () => ({
  ScheduleSearchField: () => <input aria-label="search schedule" />
}));

vi.mock("../../components/scheduling/UnifiedUserCalendar", () => ({
  UnifiedUserCalendar: ({
    currentCustomer,
    formalOnly,
    showSourceDrawer
  }: {
    currentCustomer: { name: string };
    formalOnly?: boolean;
    showSourceDrawer?: boolean;
  }) => (
    <div
      data-source-drawer-enabled={showSourceDrawer ? "true" : "false"}
      data-testid={formalOnly ? "formal-user-calendar" : "non-formal-user-calendar"}
    >
      {currentCustomer.name}
    </div>
  )
}));

const profileFixture = {
  id: 7,
  publicId: "u0000000007",
  userId: 70,
  displayName: "Formal Customer",
  city: "東京",
  bio: null,
  avatarUrl: null,
  membershipLevel: "free",
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語"],
  visibility: "public",
  isPublic: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} satisfies CustomerSelfProfile;

const successfulCustomerResource = {
  profile: profileFixture,
  customer: mapCoreCustomerToCustomer(profileFixture),
  loading: false,
  error: null,
  reload: vi.fn()
};

let container: HTMLDivElement;
let root: Root;

async function renderUserSchedulePage() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/schedule"]}>
        <UserSchedulePage />
      </MemoryRouter>
    );
  });
}

describe("UserSchedulePage formal data boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("renders the formal customer and formal-only calendar", async () => {
    vi.mocked(useCustomerSelfProfile).mockReturnValue(successfulCustomerResource);

    await renderUserSchedulePage();

    expect(container.textContent).toContain(profileFixture.displayName);
    expect(container.textContent).toContain(profileFixture.city);
    const calendar = container.querySelector('[data-testid="formal-user-calendar"]');
    expect(calendar).not.toBeNull();
    expect(calendar?.getAttribute("data-source-drawer-enabled")).toBe("true");
  });

  it("shows a retryable API failure without a fallback customer", async () => {
    const reload = vi.fn();
    vi.mocked(useCustomerSelfProfile).mockReturnValue({
      profile: null,
      customer: null,
      loading: false,
      error: "profile unavailable",
      reload
    });

    await renderUserSchedulePage();

    expect(container.textContent).toContain("profile unavailable");
    expect(container.textContent).not.toContain("Mia");
    expect(container.querySelector('[data-testid="formal-user-calendar"]')).toBeNull();
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => /重试|retry/i.test(button.textContent ?? ""))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy browser stores and fallback rows out of the page source", () => {
    expect(pageSource).toContain("useCustomerSelfProfile");
    expect(pageSource).toContain("formalOnly");
    expect(pageSource).not.toMatch(/useEntityStore|useHomeLayoutStore|customers\[0\]|config\.locations\[0\]/);
  });
});
