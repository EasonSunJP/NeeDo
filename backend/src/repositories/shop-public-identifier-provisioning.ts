import type { Prisma } from "@prisma/client";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { PublicIdentifierRepository } from "./public-identifier.repository";

export interface ProvisionedShopPublicIdentifier {
  publicId: string;
  numberPart: string;
  customerSupportPublicId: string;
}

export const provisionShopPublicIdentifier = async (
  transaction: Prisma.TransactionClient,
  input: {
    shopId: number;
    shopName: string;
    nextCandidate?: () => string;
  }
): Promise<ProvisionedShopPublicIdentifier> => {
  const supportAccount = await transaction.customerSupportAccount.create({
    data: {
      shopId: input.shopId,
      type: "SHOP",
      displayName: `${input.shopName} Customer Support`
    }
  });
  const repository = new PublicIdentifierRepository(transaction);
  const allocator = input.nextCandidate
    ? new IdentifierAllocator(repository, input.nextCandidate)
    : new IdentifierAllocator(repository);
  const pair = await allocator.allocateShopSupportPair({
    shopId: input.shopId,
    customerSupportAccountId: supportAccount.id
  });
  await transaction.shop.update({
    where: { id: input.shopId },
    data: { shopNo: pair.shopIdentifier.numberPart }
  });
  return {
    publicId: pair.shopIdentifier.publicId,
    numberPart: pair.shopIdentifier.numberPart,
    customerSupportPublicId: pair.customerSupportIdentifier.publicId
  };
};
