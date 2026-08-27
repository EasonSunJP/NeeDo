import { randomInt } from "node:crypto";
import { Prisma } from "@prisma/client";

const formatNeedoId = (value: number) => `n${value.toString().padStart(10, "0")}`;

export class NeedoIdAllocationExhaustedError extends Error {
  public constructor() {
    super("NeeDo ID allocation exhausted");
    this.name = "NeedoIdAllocationExhaustedError";
  }
}

export class NeedoIdAllocator {
  public constructor(
    private readonly nextCandidate: () => unknown = () => randomInt(0, 10_000_000_000),
    private readonly isNeedoIdCollision = (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target).includes("needo")
  ) {}

  public async withNewId<T>(create: (needoId: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await create(formatNeedoId(this.nextCandidate() as number));
      } catch (error) {
        if (!this.isNeedoIdCollision(error)) throw error;
      }
    }
    throw new NeedoIdAllocationExhaustedError();
  }
}
