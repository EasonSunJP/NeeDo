import { type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import type { AuthRequestContext } from "../services/auth.service";

export interface BackofficePreferenceRecord {
  showTestNdpData: boolean;
}

export interface BackofficePreferenceRepositoryPort {
  findByUserId(userId: number): Promise<BackofficePreferenceRecord | null>;
  update(input: {
    userId: number;
    showTestNdpData: boolean;
    context: AuthRequestContext;
  }): Promise<BackofficePreferenceRecord>;
}

export class BackofficePreferenceRepository implements BackofficePreferenceRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async findByUserId(userId: number): Promise<BackofficePreferenceRecord | null> {
    return this.client.backofficePreference.findUnique({
      where: { userId },
      select: { showTestNdpData: true }
    });
  }

  public update(input: {
    userId: number;
    showTestNdpData: boolean;
    context: AuthRequestContext;
  }): Promise<BackofficePreferenceRecord> {
    return this.client.$transaction(async (transaction) => {
      const preference = await transaction.backofficePreference.upsert({
        where: { userId: input.userId },
        create: { userId: input.userId, showTestNdpData: input.showTestNdpData },
        update: { showTestNdpData: input.showTestNdpData },
        select: { showTestNdpData: true }
      });
      await transaction.auditLog.create({
        data: {
          actorId: input.userId,
          action: "backoffice.preference.test_ndp_visibility.update",
          targetType: "User",
          targetId: input.userId,
          ip: input.context.ip,
          userAgent: input.context.userAgent ?? null,
          metadata: { showTestNdpData: input.showTestNdpData }
        }
      });
      return preference;
    });
  }
}
