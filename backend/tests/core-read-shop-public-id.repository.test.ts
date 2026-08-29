import { CoreReadRepository } from "../src/repositories/core-read.repository";

describe("CoreReadRepository public Shop lookup", () => {
  it("queries the active public identifier relation for a public Shop id", async () => {
    const findFirst = jest.fn(async () => null);
    const repository = new CoreReadRepository({ shop: { findFirst } } as never);

    await repository.findShopDetail("shop5831047296");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicIdentifier: {
            is: {
              publicId: "shop5831047296",
              status: "ACTIVE",
              deletedAt: null
            }
          }
        })
      })
    );
  });
});
