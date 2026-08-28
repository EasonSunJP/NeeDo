import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

const formatBootstrapKey = (candidate: string): string => {
  if (!/^[a-f0-9]{24}$/.test(candidate)) {
    throw new TypeError("User bootstrap key candidate must be 24 lowercase hexadecimal characters.");
  }
  return `pending:${candidate}`;
};

export class UserBootstrapKeyAllocationExhaustedError extends Error {
  public constructor() {
    super("User bootstrap key allocation exhausted");
    this.name = "UserBootstrapKeyAllocationExhaustedError";
  }
}

export class UserBootstrapKeyAllocator {
  public constructor(
    private readonly nextCandidate: () => string = () => randomBytes(12).toString("hex"),
    private readonly isBootstrapKeyCollision = (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      String(error.meta?.target).includes("needo")
  ) {}

  public async withNewKey<T>(create: (bootstrapKey: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await create(formatBootstrapKey(this.nextCandidate()));
      } catch (error) {
        if (!this.isBootstrapKeyCollision(error)) throw error;
      }
    }
    throw new UserBootstrapKeyAllocationExhaustedError();
  }
}
