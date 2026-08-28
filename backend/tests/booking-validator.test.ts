import { orderListQuerySchema } from "../src/validators/booking.validator";

describe("orderListQuerySchema", () => {
  it("accepts no date window or one complete date window up to 93 days", () => {
    expect(orderListQuerySchema.safeParse({ page: "1", pageSize: "20" }).success).toBe(true);

    const parsed = orderListQuerySchema.parse({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-12-03T00:00:00.000Z"
    });

    expect(parsed.from).toEqual(new Date("2026-09-01T00:00:00.000Z"));
    expect(parsed.to).toEqual(new Date("2026-12-03T00:00:00.000Z"));
  });

  it("rejects partial, reversed, and longer-than-93-day date windows", () => {
    expect(orderListQuerySchema.safeParse({
      from: "2026-09-01T00:00:00.000Z"
    }).success).toBe(false);
    expect(orderListQuerySchema.safeParse({
      from: "2026-09-02T00:00:00.000Z",
      to: "2026-09-01T00:00:00.000Z"
    }).success).toBe(false);
    expect(orderListQuerySchema.safeParse({
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-12-03T00:00:00.001Z"
    }).success).toBe(false);
  });
});
