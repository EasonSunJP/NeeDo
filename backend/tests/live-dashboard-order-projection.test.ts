import { BookingRepository } from "../src/repositories/booking.repository";

describe("Live dashboard order projection", () => {
  it("reads only immutable service-location codes and compact allowlisted order fields", async () => {
    const findFirst = jest.fn().mockResolvedValue({
      orderNo: "ND202609060701",
      status: "CONFIRMED",
      serviceNameSnapshot: "肩颈调理",
      priceAmount: 8800,
      service: { name: "ignored mutable service name" },
      technicianService: null,
      serviceLocation: {
        countryCode: "JP",
        admin1RegionCode: "13",
        admin2RegionCode: "13104",
        resolutionStatus: "VERIFIED",
        deletedAt: null
      }
    });
    const repository = new BookingRepository({ bookingOrder: { findFirst } } as never);

    await expect(repository.findLiveDashboardOrderEvent(701)).resolves.toEqual({
      scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
      orderNo: "ND202609060701",
      status: "confirmed",
      serviceName: "肩颈调理",
      amountJpy: 8800
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 701, deletedAt: null },
      select: expect.not.objectContaining({
        customerUserId: expect.anything(),
        note: expect.anything(),
        shopId: expect.anything(),
        technicianProfileId: expect.anything()
      })
    });
    expect(findFirst.mock.calls[0]?.[0].select.serviceLocation.select).toEqual({
      countryCode: true,
      admin1RegionCode: true,
      admin2RegionCode: true,
      resolutionStatus: true,
      deletedAt: true
    });
  });

  it("falls back to country scope when the immutable location is unresolved", async () => {
    const repository = new BookingRepository({
      bookingOrder: {
        findFirst: jest.fn().mockResolvedValue({
          orderNo: "ND202609060702",
          status: "PENDING",
          serviceNameSnapshot: "整体",
          priceAmount: 9000,
          service: null,
          technicianService: null,
          serviceLocation: {
            countryCode: "JP",
            admin1RegionCode: "13",
            admin2RegionCode: "13104",
            resolutionStatus: "UNRESOLVED",
            deletedAt: null
          }
        })
      }
    } as never);

    await expect(repository.findLiveDashboardOrderEvent(702)).resolves.toMatchObject({
      scope: { countryCode: "JP", admin1Code: null, admin2Code: null }
    });
  });
});
