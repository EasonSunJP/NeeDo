import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type {
  PublicIdentifierCreateInput,
  PublicIdentifierRecord,
  PublicIdentifierRepositoryPort,
  ShopSupportPairCreateInput,
  ShopSupportPairRecord
} from "../services/public-identifier.service";

type PublicIdentifierPrismaClient = PrismaClient | Prisma.TransactionClient;

export class PublicIdentifierRepository implements PublicIdentifierRepositoryPort {
  public constructor(private readonly client: PublicIdentifierPrismaClient = prisma) {}

  public async findActiveByPublicId(publicId: string): Promise<PublicIdentifierRecord | null> {
    return this.client.publicIdentifier.findFirst({
      where: { publicId, status: "ACTIVE", deletedAt: null }
    });
  }

  public async findAccountNumberByIdentityId(userIdentityId: number): Promise<string | null> {
    const identity = await this.client.userIdentity.findFirst({
      where: {
        id: userIdentityId,
        isActive: true,
        deletedAt: null,
        user: {
          is: {
            isActive: true,
            deletedAt: null,
            accountNo: { not: null }
          }
        }
      },
      select: {
        user: { select: { accountNo: true } }
      }
    });
    return identity?.user.accountNo ?? null;
  }

  public async isVanityNumberReserved(numberPart: string): Promise<boolean> {
    const reservation = await this.client.vanityNumberReservation.findFirst({
      where: { numberPart, status: "sealed", deletedAt: null },
      select: { id: true }
    });
    return reservation !== null;
  }

  public async createIdentifier(
    input: PublicIdentifierCreateInput
  ): Promise<PublicIdentifierRecord> {
    return this.runInTransaction(async (client) => {
      if (
        (input.kind === "U" || input.kind === "NEEDO") &&
        input.userIdentityId !== undefined
      ) {
        await client.userIdentity.update({
          where: { id: input.userIdentityId },
          data: {
            user: {
              update: {
                accountNo: input.numberPart,
                primaryIdentityType: input.kind
              }
            }
          }
        });
      }

      return client.publicIdentifier.create({ data: input });
    });
  }

  public async createShopSupportPair(
    input: ShopSupportPairCreateInput
  ): Promise<ShopSupportPairRecord> {
    return this.runInTransaction(async (client) => {
      const shopIdentifier = await client.publicIdentifier.create({
        data: {
          publicId: input.shopPublicId,
          numberPart: input.numberPart,
          kind: "SHOP",
          shopId: input.shopId,
          loginAllowed: false,
          searchable: true
        }
      });
      const customerSupportIdentifier = await client.publicIdentifier.create({
        data: {
          publicId: input.customerSupportPublicId,
          numberPart: input.numberPart,
          kind: "CUSTOMER_SUPPORT",
          customerSupportAccountId: input.customerSupportAccountId,
          loginAllowed: false,
          searchable: true
        }
      });

      return { shopIdentifier, customerSupportIdentifier };
    });
  }

  public isRetryableIdentifierCollision(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error)) return false;
    const record = error as {
      code?: unknown;
      meta?: {
        target?: unknown;
        driverAdapterError?: {
          cause?: {
            constraint?: { index?: unknown; fields?: unknown };
          };
        };
      };
    };
    if (record.code !== "P2002") return false;

    const constraint = record.meta?.driverAdapterError?.cause?.constraint;
    const target = [record.meta?.target, constraint?.index, constraint?.fields]
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => String(value ?? ""))
      .join(" ")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase();

    return (
      target.includes("public_id") ||
      target.includes("account_no") ||
      target.includes("kind_number_part") ||
      (target.includes("kind") && target.includes("number_part"))
    );
  }

  private async runInTransaction<T>(
    handler: (client: PublicIdentifierPrismaClient) => Promise<T>
  ): Promise<T> {
    if (this.canStartTransaction(this.client)) {
      return this.client.$transaction((transaction) => handler(transaction));
    }
    return handler(this.client);
  }

  private canStartTransaction(client: PublicIdentifierPrismaClient): client is PrismaClient {
    return "$transaction" in client && typeof client.$transaction === "function";
  }
}
