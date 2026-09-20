import { beforeEach, describe, expect, it } from "vitest";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { BookingScheduleSlot } from "../booking/api";
import {
  getFormalMerchantScheduleCacheResourceKey,
  readFormalScheduleWindow,
  refreshFormalScheduleWindow,
  writeFormalScheduleWindow
} from "./formalScheduleWindowCache";

const slot = { id: 1, startsAt: "2026-09-13T01:00:00.000Z" } as BookingScheduleSlot;
const input = {
  cacheScope: "account:formal-schedule-test",
  from: new Date("2026-09-13T00:00:00.000Z"),
  resourceKey: "shop-12",
  scheduleScope: "merchant-admin" as const,
  to: new Date("2026-09-27T00:00:00.000Z")
};

describe("formal schedule window cache", () => {
  beforeEach(async () => {
    await persistentResourceCache.clearScope(input.cacheScope);
  });

  it("normalizes numeric and already-prefixed merchant store resource keys", () => {
    expect(getFormalMerchantScheduleCacheResourceKey("11")).toBe("store-11");
    expect(getFormalMerchantScheduleCacheResourceKey("store-11")).toBe("store-11");
  });

  it("keeps a fresh encrypted window available across cache instances", async () => {
    await writeFormalScheduleWindow(input, [slot], "2026-09-13T02:00:00.000Z");
    await expect(readFormalScheduleWindow(input, new Date("2026-09-13T03:00:00.000Z")))
      .resolves.toEqual([slot]);
  });

  it("does not display cached schedule data older than 24 hours", async () => {
    await writeFormalScheduleWindow(input, [slot], "2026-09-12T01:59:59.999Z");
    await expect(readFormalScheduleWindow(input, new Date("2026-09-13T02:00:00.000Z")))
      .resolves.toBeNull();
  });

  it("refreshes and persists the latest sorted window", async () => {
    const later = { ...slot, id: 2, startsAt: "2026-09-13T03:00:00.000Z" };
    await expect(refreshFormalScheduleWindow(input, async () => [later, slot]))
      .resolves.toEqual([slot, later]);
    await expect(readFormalScheduleWindow(input)).resolves.toEqual([slot, later]);
  });
});
