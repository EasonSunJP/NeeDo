import { backofficeManagedUserDetailQuerySchema } from "../src/validators/backoffice.validator";

describe("user LOG date range", () => {
  it("accepts an explicit UTC interval while preserving pagination", () => {
    expect(backofficeManagedUserDetailQuerySchema.parse({ audit_from: "2026-09-01T00:00:00.000Z", audit_to: "2026-09-08T00:00:00.000Z" })).toMatchObject({ audit_from: "2026-09-01T00:00:00.000Z", audit_page: 1, audit_page_size: 10 });
  });
  it("rejects missing, invalid and reversed range boundaries", () => {
    for (const query of [{ audit_from: "bad" }, { audit_from: "2026-09-01T00:00:00.000Z" }, { audit_from: "2026-09-08T00:00:00.000Z", audit_to: "2026-09-01T00:00:00.000Z" }]) {
      expect(backofficeManagedUserDetailQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});
