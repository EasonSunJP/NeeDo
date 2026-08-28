// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerProfileApi, type CustomerSelfProfile } from "./customerProfileApi";
import { useCustomerSelfProfile } from "./useCustomerSelfProfile";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profile: CustomerSelfProfile = {
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
};

function ResourceProbe() {
  const resource = useCustomerSelfProfile();
  return (
    <div>
      <span data-testid="loading">{String(resource.loading)}</span>
      <span data-testid="profile">{resource.profile?.publicId ?? "null"}</span>
      <span data-testid="customer">{resource.customer?.systemId ?? "null"}</span>
      <span data-testid="error">{resource.error ?? "null"}</span>
      <button onClick={resource.reload} type="button">reload</button>
    </div>
  );
}

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

let container: HTMLDivElement;
let root: Root;

describe("useCustomerSelfProfile", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("returns the authenticated formal customer without a fallback row", async () => {
    vi.spyOn(customerProfileApi, "getMine").mockResolvedValue(profile);

    await act(async () => root.render(<ResourceProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe(profile.publicId));

    expect(container.querySelector('[data-testid="profile"]')?.textContent).toBe(profile.publicId);
    expect(container.querySelector('[data-testid="loading"]')?.textContent).toBe("false");
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("null");
  });

  it("shares the initial formal profile request during StrictMode effect replay", async () => {
    const getMine = vi.spyOn(customerProfileApi, "getMine").mockResolvedValue(profile);

    await act(async () => root.render(<StrictMode><ResourceProbe /></StrictMode>));
    await waitFor(() => expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe(profile.publicId));

    expect(getMine).toHaveBeenCalledTimes(1);
  });

  it("keeps customer null after a failed request and retries explicitly", async () => {
    vi.spyOn(customerProfileApi, "getMine")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(profile);

    await act(async () => root.render(<ResourceProbe />));
    await waitFor(() => expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("network"));
    expect(container.querySelector('[data-testid="profile"]')?.textContent).toBe("null");
    expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe("null");

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe(profile.publicId));
    expect(container.querySelector('[data-testid="error"]')?.textContent).toBe("null");
  });

  it("ignores a slower response from an older request generation", async () => {
    let resolveFirst: ((value: CustomerSelfProfile) => void) | undefined;
    const firstRequest = new Promise<CustomerSelfProfile>((resolve) => {
      resolveFirst = resolve;
    });
    const latestProfile = { ...profile, publicId: "u0000000008", displayName: "Latest Customer" };
    vi.spyOn(customerProfileApi, "getMine")
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(latestProfile);

    await act(async () => root.render(<ResourceProbe />));
    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitFor(() => expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe(latestProfile.publicId));

    await act(async () => resolveFirst?.(profile));
    expect(container.querySelector('[data-testid="customer"]')?.textContent).toBe(latestProfile.publicId);
  });
});
