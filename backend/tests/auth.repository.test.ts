import { expect, it, jest } from "@jest/globals";
import { AuthRepository } from "../src/repositories/auth.repository";

it("looks up formal login identifiers by email or immutable NeeDo ID only", async () => {
  const findFirst = jest.fn(async () => null);
  const repository = new AuthRepository({ user: { findFirst } } as never);

  await repository.findUserByLoginIdentifier("n0000000001");

  expect(findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        OR: [{ email: "n0000000001" }, { needoId: "n0000000001" }],
        deletedAt: null
      }
    })
  );
});
