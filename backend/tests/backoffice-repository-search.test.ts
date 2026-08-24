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
});
