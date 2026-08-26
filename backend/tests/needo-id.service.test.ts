import { describe, expect, it, jest } from "@jest/globals";
import { NeedoIdAllocator } from "../src/services/needo-id.service";

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
});
