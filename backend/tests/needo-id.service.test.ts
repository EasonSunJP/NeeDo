import { describe, expect, it, jest } from "@jest/globals";
import { Prisma } from "@prisma/client";
import {
  NeedoIdAllocationExhaustedError,
  NeedoIdAllocator
} from "../src/services/needo-id.service";

describe("NeedoIdAllocator", () => {
  it("formats a cryptographically supplied candidate as n plus ten digits", async () => {
    const allocator = new NeedoIdAllocator(() => 123);
    await expect(allocator.withNewId(async (needoId) => needoId)).resolves.toBe("n0000000123");
  });

  it("retries only a needoId unique collision", async () => {
    const next = jest.fn().mockReturnValueOnce(123).mockReturnValueOnce(456);
    const allocator = new NeedoIdAllocator(next, (error) => error === "needo-id-conflict");
    const create = jest.fn(async (needoId: string) => {
      if (needoId === "n0000000123") throw "needo-id-conflict";
      return needoId;
    });
    await expect(allocator.withNewId(create)).resolves.toBe("n0000000456");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("raises a typed exhaustion error after eight NeeDo ID collisions", async () => {
    const create = jest.fn(async () => {
      throw "needo-id-conflict";
    });
    const allocator = new NeedoIdAllocator(() => 123, (error) => error === "needo-id-conflict");

    await expect(allocator.withNewId(create)).rejects.toBeInstanceOf(NeedoIdAllocationExhaustedError);
    expect(create).toHaveBeenCalledTimes(8);
  });

  it("passes through a P2002 for a different unique field", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("email conflict", {
      clientVersion: "test",
      code: "P2002",
      meta: { target: ["email"] }
    });
    const allocator = new NeedoIdAllocator(() => 123);

    await expect(allocator.withNewId(async () => { throw error; })).rejects.toBe(error);
  });
});
