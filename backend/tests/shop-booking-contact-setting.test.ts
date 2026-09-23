import {
  backofficeShopUpdateBodySchema,
  merchantShopUpdateBodySchema
} from "../src/validators/backoffice.validator";

const validTargets = [
  { target: "owner", employeeNeedoId: null },
  { target: "employee", employeeNeedoId: "u0000000123" },
  { target: "selected_technician", employeeNeedoId: null }
];

describe("shared shop booking contact setting", () => {
  it.each(validTargets)("accepts %p from merchant and operations", (bookingContact) => {
    expect(merchantShopUpdateBodySchema.safeParse({ bookingContact }).success).toBe(true);
    expect(backofficeShopUpdateBodySchema.safeParse({ bookingContact }).success).toBe(true);
  });

  it("rejects an employee without an identifier and unavailable service accounts", () => {
    for (const bookingContact of [
      { target: "employee", employeeNeedoId: null },
      { target: "owner", employeeNeedoId: "u0000000123" },
      { target: "service_account", employeeNeedoId: null }
    ]) {
      expect(merchantShopUpdateBodySchema.safeParse({ bookingContact }).success).toBe(false);
      expect(backofficeShopUpdateBodySchema.safeParse({ bookingContact }).success).toBe(false);
    }
  });
});
