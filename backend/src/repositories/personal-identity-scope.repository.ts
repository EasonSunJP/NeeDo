import type { Prisma, PrismaClient } from "@prisma/client";

type IdentityLookupClient =
  | Pick<PrismaClient, "userIdentity">
  | Pick<Prisma.TransactionClient, "userIdentity">;

export const resolveCanonicalPersonalIdentityId = async (
  client: IdentityLookupClient,
  userId: number
): Promise<number | null> => {
  const customer = await client.userIdentity.findFirst({
    where: {
      userId,
      type: { in: ["customer", "user", "u"] },
      isActive: true,
      deletedAt: null
    },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true }
  });
  if (customer) return customer.id;

  const fallback = await client.userIdentity.findFirst({
    where: { userId, isActive: true, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
    select: { id: true }
  });
  return fallback?.id ?? null;
};
