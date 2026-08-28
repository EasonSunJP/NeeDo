import { describe, expect, it } from "vitest";
import { defaultDineInState } from "./seed";
import { getDefaultDineInStateForReset, resolveQrTokenInState } from "./store";
import storeSource from "./store.ts?raw";

describe("dine-in formal empty state", () => {
  it("contains no generated QR codes, sessions, menus, orders, payments, or staff records", () => {
    expect(defaultDineInState).toEqual({
      qrCodes: [],
      facilityAreas: [],
      facilityUnits: [],
      diningSessions: [],
      menus: [],
      menuCategories: [],
      menuItems: [],
      orderItems: [],
      orders: [],
      payments: [],
      facilityAssignments: [],
      staffPresence: [],
      serviceCalls: [],
      auditLogs: [],
      reviewIntents: [],
    });
    expect(getDefaultDineInStateForReset()).toEqual(defaultDineInState);
  });

  it("does not resolve retired demonstration QR tokens and isolates old browser state", () => {
    expect(() => resolveQrTokenInState(getDefaultDineInStateForReset(), "qr-table-a08", "test-user-1")).toThrow(
      "QR code is inactive or unknown.",
    );
    expect(storeSource).toContain('const dineInStorageKey = "needo.dine-in.formal-state.v1";');
    expect(storeSource).not.toContain('const dineInStorageKey = "needo.dine-in.state.v1";');
  });
});
