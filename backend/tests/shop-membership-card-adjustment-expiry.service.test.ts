import { ShopMembershipCardAdjustmentExpiryService } from "../src/services/shop-membership-card-adjustment-expiry.service";

describe("ShopMembershipCardAdjustmentExpiryService", () => {
  it("delegates a bounded batch to the database-authoritative repository", async () => {
    const repository = {
      expireDue: jest.fn().mockResolvedValue({ scanned: 3, expired: 2, failed: 1 })
    };
    const service = new ShopMembershipCardAdjustmentExpiryService(repository);

    await expect(service.expireDue({ batchSize: 100 })).resolves.toEqual({
      scanned: 3,
      expired: 2,
      failed: 1
    });
    expect(repository.expireDue).toHaveBeenCalledWith({ batchSize: 100 });
  });

  it.each([0, 501, 1.5])("rejects invalid batch size %s", async (batchSize) => {
    const repository = { expireDue: jest.fn() };
    const service = new ShopMembershipCardAdjustmentExpiryService(repository);
    await expect(service.expireDue({ batchSize })).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.expireDue).not.toHaveBeenCalled();
  });
});
