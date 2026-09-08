import { describe, expect, it } from "vitest";
import { getRebookPath } from "./rebookRoute";

describe("getRebookPath", () => {
  it("preserves technician service, current shop, and selected staff", () => {
    expect(getRebookPath({
      serviceId: undefined,
      technicianServiceId: "77",
      shopId: "4",
      technicianProfileId: "9",
      mode: "store"
    })).toBe("/checkout/technician-service-77?shop=4&technician=9");
  });

  it("keeps shop service rebooking separate", () => {
    expect(getRebookPath({
      serviceId: "42",
      technicianServiceId: undefined,
      shopId: "4",
      technicianProfileId: "9",
      mode: "home"
    })).toBe("/checkout/42?store=4&mode=home&technician=9");
  });

  it("does not build an unscoped technician service rebook route", () => {
    expect(getRebookPath({
      technicianServiceId: "77",
      mode: "store"
    })).toBeNull();
  });
});
