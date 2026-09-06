import { BookingRepository } from "../src/repositories/booking.repository";

describe("Live dashboard order projection", () => {
  it("keeps historical missing snapshots visible nationally without inventing a narrow region", async () => {
    const repository = new BookingRepository({ bookingOrder: { findMany: jest.fn().mockResolvedValue([
      { id: 703, orderNo: "ND703", status: "PENDING", serviceNameSnapshot: "Care", priceAmount: 9000, serviceLocation: null }
    ]) } } as never);
    await expect(repository.findLiveDashboardOrderEvents([703])).resolves.toEqual([
      expect.objectContaining({ orderId: 703, scope: { countryCode: "JP", admin1Code: null, admin2Code: null } })
    ]);
  });

  it("reads only immutable service-location codes and compact allowlisted order fields", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 701,
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
      }
    ]);
    const repository = new BookingRepository({ bookingOrder: { findMany } } as never);

    await expect(repository.findLiveDashboardOrderEvents([701])).resolves.toEqual([
      {
        orderId: 701,
        scope: { countryCode: "JP", admin1Code: "13", admin2Code: "13104" },
        orderNo: "ND202609060701",
        status: "confirmed",
        serviceName: "肩颈调理",
        amountJpy: 8800
      }
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: [701] }, deletedAt: null },
      select: expect.not.objectContaining({
        customerUserId: expect.anything(),
        note: expect.anything(),
        shopId: expect.anything(),
        technicianProfileId: expect.anything()
      })
    });
    expect(findMany.mock.calls[0]?.[0].select.serviceLocation.select).toEqual({
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
        findMany: jest.fn().mockResolvedValue([
          {
            id: 702,
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
          }
        ])
      }
    } as never);

    await expect(repository.findLiveDashboardOrderEvents([702])).resolves.toEqual([
      expect.objectContaining({
        orderId: 702,
        scope: { countryCode: "JP", admin1Code: null, admin2Code: null }
      })
    ]);
  });
});
