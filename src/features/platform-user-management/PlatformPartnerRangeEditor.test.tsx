// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformPartnerRangeEditor } from "./PlatformPartnerRangeEditor";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ markPartnerProfile: vi.fn(), listUserPartnerProfiles: vi.fn() }));
vi.mock("../../api/platformPartners", () => ({
  platformPartnersApi: { markPartnerProfile: state.markPartnerProfile, listUserPartnerProfiles: state.listUserPartnerProfiles }
}));

describe("PlatformPartnerRangeEditor", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    state.markPartnerProfile.mockReset().mockResolvedValue({});
    state.listUserPartnerProfiles.mockReset().mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
    window.localStorage.setItem("needo.language", "zh");
    window.localStorage.setItem("needo.language.mode", "manual");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it("renders independent start, end, and permanent controls for every partner type", () => {
    act(() => root.render(<PlatformPartnerRangeEditor userId={41} />));

    expect(container.querySelectorAll('input[aria-label="开始日期"]')).toHaveLength(3);
    expect(container.querySelectorAll('input[aria-label="结束日期"]')).toHaveLength(3);
    expect(container.querySelectorAll('input[aria-label="永久"]')).toHaveLength(3);
    expect(container.textContent).toContain("代理商");
    expect(container.textContent).toContain("加盟商");
    expect(container.textContent).toContain("供货商");
  });

  it("disables only the matching end date when permanent is selected", () => {
    act(() => root.render(<PlatformPartnerRangeEditor userId={41} />));
    const permanent = container.querySelectorAll<HTMLInputElement>('input[aria-label="永久"]');
    const ends = container.querySelectorAll<HTMLInputElement>('input[aria-label="结束日期"]');

    act(() => permanent[1]?.click());

    expect(ends[0]?.disabled).toBe(false);
    expect(ends[1]?.disabled).toBe(true);
    expect(ends[2]?.disabled).toBe(false);
  });

  it("loads and paginates immutable history independently for each partner type", async () => {
    state.listUserPartnerProfiles.mockImplementation(async (_userId, input) => ({
      list: [], total: input.partnerType === "agent" ? 25 : 0, page: input.page ?? 1, page_size: 20
    }));

    await act(async () => root.render(<PlatformPartnerRangeEditor userId={41} />));

    expect(state.listUserPartnerProfiles).toHaveBeenCalledWith(41, { partnerType: "agent", page: 1, pageSize: 20 });
    expect(state.listUserPartnerProfiles).toHaveBeenCalledWith(41, { partnerType: "franchisee", page: 1, pageSize: 20 });
    expect(state.listUserPartnerProfiles).toHaveBeenCalledWith(41, { partnerType: "supplier", page: 1, pageSize: 20 });
    const next = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "下一页");
    await act(async () => next?.click());
    expect(state.listUserPartnerProfiles).toHaveBeenCalledWith(41, { partnerType: "agent", page: 2, pageSize: 20 });
  });
});
