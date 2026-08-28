import { describe, expect, it, jest } from "@jest/globals";
import { Prisma } from "@prisma/client";
import {
  UserBootstrapKeyAllocationExhaustedError,
  UserBootstrapKeyAllocator
} from "../src/services/user-bootstrap-key.service";

describe("UserBootstrapKeyAllocator", () => {
  it("creates a non-public transaction-local bootstrap key", async () => {
    const allocator = new UserBootstrapKeyAllocator(() => "0123456789abcdef01234567");
    await expect(allocator.withNewKey(async (key) => key)).resolves.toBe(
      "pending:0123456789abcdef01234567"
    );
  });

  it("retries only a bootstrap-key unique collision", async () => {
    const next = jest
      .fn<() => string>()
      .mockReturnValueOnce("0123456789abcdef01234567")
      .mockReturnValueOnce("89abcdef0123456701234567");
    const allocator = new UserBootstrapKeyAllocator(next, (error) => error === "key-conflict");
    const create = jest.fn(async (key: string) => {
      if (key === "pending:0123456789abcdef01234567") throw "key-conflict";
      return key;
    });

    await expect(allocator.withNewKey(create)).resolves.toBe(
      "pending:89abcdef0123456701234567"
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("fails after eight bootstrap-key collisions", async () => {
    const create = jest.fn(async () => {
      throw "key-conflict";
    });
    const allocator = new UserBootstrapKeyAllocator(
      () => "0123456789abcdef01234567",
      (error) => error === "key-conflict"
    );

    await expect(allocator.withNewKey(create)).rejects.toBeInstanceOf(
      UserBootstrapKeyAllocationExhaustedError
    );
    expect(create).toHaveBeenCalledTimes(8);
  });

  it("does not retry unrelated unique constraints", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("duplicate email", {
      clientVersion: "test",
      code: "P2002",
      meta: { target: "users_email_key" }
    });
    const allocator = new UserBootstrapKeyAllocator(() => "0123456789abcdef01234567");

    await expect(allocator.withNewKey(async () => { throw error; })).rejects.toBe(error);
  });
});
