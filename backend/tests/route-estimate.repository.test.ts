import { describe, expect, it, jest } from "@jest/globals";
import { RouteEstimateRepository } from "../src/repositories/route-estimate.repository";

describe("RouteEstimateRepository", () => {
  it("treats formal home_visit services as eligible for route estimates", async () => {
    const findFirst = jest.fn<() => Promise<null>>().mockResolvedValue(null);
    const repository = new RouteEstimateRepository({
      scheduleSlot: { findFirst }
    } as never);

    await repository.findEligibleContext(
      "00000000-0000-4000-8000-000000000031",
      101,
      new Date("2026-09-12T00:00:00.000Z")
    );

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        service: expect.objectContaining({
          serviceMode: { in: expect.arrayContaining(["home_visit"]) }
        })
      })
    }));
  });
});
