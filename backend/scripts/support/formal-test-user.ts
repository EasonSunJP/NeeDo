import type { Prisma, PrismaClient } from "@prisma/client";
import { UserRepository } from "../../src/repositories/user.repository";

export const createFormalTestUser = (
  client: PrismaClient,
  input: { email: string; passwordHash: string; username: string }
) =>
  new UserRepository(client).create({
    email: input.email,
    isActive: true,
    passwordHash: input.passwordHash,
    username: input.username
  });

export const deleteFormalTestUserFoundations = async (
  transaction: Prisma.TransactionClient,
  userIds: number[]
): Promise<void> => {
  if (userIds.length === 0) return;
  const identities = await transaction.userIdentity.findMany({
    where: { userId: { in: userIds } },
    select: { id: true }
  });
  await transaction.publicIdentifier.deleteMany({
    where: { userIdentityId: { in: identities.map((identity) => identity.id) } }
  });
  await transaction.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await transaction.customerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await transaction.userIdentity.deleteMany({ where: { userId: { in: userIds } } });
};
