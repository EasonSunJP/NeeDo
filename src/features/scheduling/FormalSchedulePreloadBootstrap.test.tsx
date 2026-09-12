// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../auth/rbac";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { BookingScheduleSlot } from "../booking/api";

const mocks = vi.hoisted(() => ({ preload: vi.fn(), session: null as AuthSession | null }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: mocks.session }) }));
vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, schedulingApi: { ...original.schedulingApi, preload: mocks.preload } };
});

import { FormalSchedulePreloadBootstrap } from "./FormalSchedulePreloadBootstrap";
import { readFormalScheduleWindow } from "./formalScheduleWindowCache";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const makeSlot = (id: number): BookingScheduleSlot => ({
  id,
  startsAt: `2026-09-13T0${id}:00:00.000Z`
} as BookingScheduleSlot);

const session = {
  id: 7,
  loggedInAt: "2026-09-13T00:00:00.000Z",
  activeIdentityId: 70,
  linkedStoreId: "store-999",
  linkedTechnicianId: "technician-31",
  allowedPortals: ["merchant", "technician"]
} as AuthSession;

describe("FormalSchedulePreloadBootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    mocks.preload.mockReset();
    mocks.session = null;
    await persistentResourceCache.clearScope("account:7");
    await persistentResourceCache.clearScope("account:10");
  });

  it("starts after login and persists all merchant and technician pages", async () => {
    mocks.session = session;
    mocks.preload
      .mockResolvedValueOnce({
        fetchedAt: "2026-09-13T00:00:00.000Z",
        merchant: { identityId: 71, shopId: 12, list: [makeSlot(1)], page: 1, page_size: 1, total: 2 },
        technician: { identityId: 72, technicianProfileId: 31, list: [makeSlot(1)], page: 1, page_size: 1, total: 2 }
      })
      .mockResolvedValueOnce({
        fetchedAt: "2026-09-13T00:00:01.000Z",
        merchant: { identityId: 71, shopId: 12, list: [makeSlot(2)], page: 2, page_size: 1, total: 2 },
        technician: { identityId: 72, technicianProfileId: 31, list: [makeSlot(2)], page: 2, page_size: 1, total: 2 }
      });

    await act(async () => root.render(<FormalSchedulePreloadBootstrap />));
    await vi.waitFor(() => expect(mocks.preload).toHaveBeenCalledTimes(2));

    const firstInput = mocks.preload.mock.calls[0]?.[0];
    await vi.waitFor(async () => {
      await expect(readFormalScheduleWindow({
        cacheScope: "account:7",
        from: firstInput.from,
        resourceKey: "store-12",
        scheduleScope: "merchant-admin",
        to: firstInput.to
      }, new Date("2026-09-13T01:00:00.000Z"))).resolves.toHaveLength(2);
    });
  });

  it("does nothing for an account without schedule portals", async () => {
    mocks.session = { ...session, id: 8, allowedPortals: ["user"] };
    await act(async () => root.render(<FormalSchedulePreloadBootstrap />));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.preload).not.toHaveBeenCalled();
  });

  it("deduplicates repeated mounts for the same authenticated session", async () => {
    mocks.session = { ...session, id: 9, loggedInAt: "2026-09-13T00:00:09.000Z" };
    mocks.preload.mockResolvedValue({
      fetchedAt: "2026-09-13T00:00:09.000Z",
      merchant: null,
      technician: null
    });

    await act(async () => root.render(<FormalSchedulePreloadBootstrap />));
    await vi.waitFor(() => expect(mocks.preload).toHaveBeenCalledTimes(1));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<FormalSchedulePreloadBootstrap />));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.preload).toHaveBeenCalledTimes(1);
  });

  it("does not cache an incomplete paginated preload response", async () => {
    mocks.session = { ...session, id: 10, loggedInAt: "2026-09-13T00:00:10.000Z" };
    mocks.preload
      .mockResolvedValueOnce({
        fetchedAt: "2026-09-13T00:00:10.000Z",
        merchant: { identityId: 71, shopId: 12, list: [makeSlot(1)], page: 1, page_size: 1, total: 2 },
        technician: null
      })
      .mockResolvedValueOnce({
        fetchedAt: "2026-09-13T00:00:11.000Z",
        merchant: { identityId: 71, shopId: 12, list: [], page: 2, page_size: 1, total: 2 },
        technician: null
      });

    await act(async () => root.render(<FormalSchedulePreloadBootstrap />));
    await vi.waitFor(() => expect(mocks.preload).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const firstInput = mocks.preload.mock.calls[0]?.[0];
    await expect(readFormalScheduleWindow({
      cacheScope: "account:10",
      from: firstInput.from,
      resourceKey: "store-12",
      scheduleScope: "merchant-admin",
      to: firstInput.to
    }, new Date("2026-09-13T01:00:00.000Z"))).resolves.toBeNull();
  });
});
