import type { Prisma } from "@prisma/client";

const personalIdentityTypes = ["customer", "user", "u", "technician", "scout"];

export async function syncPersonalDisplayName(
  transaction: Prisma.TransactionClient,
  input: {
    displayName: string;
    source: "customer" | "technician";
    userId: number;
  }
): Promise<void> {
  const counterpartProfileUpdate =
    input.source === "customer"
      ? transaction.technicianProfile.updateMany({
          where: { userId: input.userId, deletedAt: null },
          data: { displayName: input.displayName }
        })
      : transaction.customerProfile.updateMany({
          where: { userId: input.userId, deletedAt: null },
          data: { displayName: input.displayName }
        });

  await Promise.all([
    counterpartProfileUpdate,
    transaction.user.update({
      where: { id: input.userId },
      data: { username: input.displayName }
    }),
    transaction.userIdentity.updateMany({
      where: {
        userId: input.userId,
        type: { in: personalIdentityTypes },
        isActive: true,
        deletedAt: null
      },
      data: { displayName: input.displayName }
    })
  ]);
}
