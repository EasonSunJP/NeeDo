import { BackofficeRepository } from "../src/repositories/backoffice.repository";

function modelClient() {
  return {
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0)
  };
}

describe("BackofficeRepository keyword filters", () => {
  it("applies the validated keyword to every data-center list", async () => {
    const client = {
      bookingOrder: modelClient(),
      scheduleSlot: modelClient(),
      technicianProfile: modelClient(),
      shop: modelClient(),
      orderFinancial: modelClient()
    };
    const repository = new BackofficeRepository(client as never);
    const query = { scope: "platform" as const, keyword: "Aoyama", page: 1, pageSize: 20 };

    await repository.listOrders(query);
    await repository.listSchedule(query);
    await repository.listTechnicians(query);
    await repository.listShops(query);
    await repository.listFinanceSettlements(query);

    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ orderNo: { contains: "Aoyama" } }]) })
    }));
    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    }));
    expect(client.scheduleSlot.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ shop: { name: { contains: "Aoyama" } } }]) })
    }));
    expect(client.technicianProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ displayName: { contains: "Aoyama" } }]) })
    }));
    expect(client.shop.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ name: { contains: "Aoyama" } }]) })
    }));
    expect(client.orderFinancial.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([{ bookingOrder: { orderNo: { contains: "Aoyama" } } }]) })
    }));
  });

  it.each([
    ["PENDING", "pending"],
    ["CONFIRMED", "confirmed"],
    ["REFUND_PENDING", "refundPending"],
    ["REFUNDED", "refunded"]
  ])("maps persisted payment status %s into the backoffice order payload", async (paymentStatus, expected) => {
    const order = {
      id: 31,
      orderNo: "ND202608250001",
      status: "CONFIRMED",
      paymentStatus,
      customerUserId: 7,
      customer: {
        username: "Customer",
        email: "customer@example.com",
        customerProfile: { id: 41 }
      },
      serviceId: 3,
      serviceNameSnapshot: "Formal Service",
      service: { name: "Formal Service" },
      shopId: 11,
      shop: { name: "Aoyama Care Studio" },
      technicianProfileId: 17,
      technicianProfile: {
        displayName: "Mika",
        user: {
          identities: [{ publicIdentifier: { publicId: "s0000000017" } }]
        }
      },
      fulfillmentMode: "store",
      priceAmount: { toString: () => "9800" },
      currency: "JPY",
      startsAt: new Date("2026-08-25T01:00:00.000Z"),
      endsAt: new Date("2026-08-25T02:00:00.000Z"),
      note: null,
      cancelReason: null,
      createdAt: new Date("2026-08-24T01:00:00.000Z"),
      updatedAt: new Date("2026-08-25T01:00:00.000Z")
    };
    const client = {
      bookingOrder: {
        findMany: jest.fn(async () => [order]),
        count: jest.fn(async () => 1)
      }
    };
    const repository = new BackofficeRepository(client as never);

    const response = await repository.listOrders({ scope: "platform", page: 1, pageSize: 20 });

    expect(response.list[0]?.paymentStatus).toBe(expected);
    expect(response.list[0]).toMatchObject({
      customerProfileId: 41,
      technicianNeedoId: "s0000000017"
    });
  });
});
