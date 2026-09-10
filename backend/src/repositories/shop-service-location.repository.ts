import type { Prisma } from "@prisma/client";

import {
  AdministrativeRegionRepository,
  type AdministrativeRegionRepositoryPort,
  type VerifiedAdministrativeRegionScope
} from "./administrative-region.repository";
import { toAuditLogCreateData } from "./audit-log.repository";
import type { VerifiedServiceLocationInput } from "../validators/administrative-region.validator";

export interface ShopServiceLocationVerificationInput {
  shopId: number;
  verifiedById: number;
  serviceLocation: VerifiedServiceLocationInput;
  verifiedAt?: Date;
  auditAction: string;
  auditMetadata?: Record<string, unknown>;
}

export interface ShopServiceLocationVerificationDependencies {
  administrativeRegions: Pick<AdministrativeRegionRepositoryPort, "resolveVerifiedScope">;
}

export const verifyShopServiceLocationInTransaction = async (
  transaction: Prisma.TransactionClient,
  input: ShopServiceLocationVerificationInput,
  dependencies?: ShopServiceLocationVerificationDependencies
): Promise<VerifiedAdministrativeRegionScope> => {
  const administrativeRegions =
    dependencies?.administrativeRegions ?? new AdministrativeRegionRepository(transaction);
  const scope = await administrativeRegions.resolveVerifiedScope(
    input.serviceLocation,
    transaction
  );
  const verifiedAt = input.verifiedAt ?? new Date();

  await transaction.shopServiceLocation.upsert({
    where: { shopId: input.shopId },
    create: {
      shopId: input.shopId,
      countryCode: scope.countryCode,
      admin1RegionId: scope.admin1RegionId,
      admin2RegionId: scope.admin2RegionId,
      datasetVersion: scope.datasetVersion,
      verifiedAt,
      verifiedById: input.verifiedById
    },
    update: {
      countryCode: scope.countryCode,
      admin1RegionId: scope.admin1RegionId,
      admin2RegionId: scope.admin2RegionId,
      datasetVersion: scope.datasetVersion,
      verifiedAt,
      verifiedById: input.verifiedById,
      deletedAt: null
    }
  });
  await transaction.auditLog.create({
    data: toAuditLogCreateData({
      actorId: input.verifiedById,
      action: input.auditAction,
      targetType: "Shop",
      targetId: input.shopId,
      metadata: {
        ...input.auditMetadata,
        countryCode: scope.countryCode,
        admin1Code: scope.admin1Code,
        admin1NameJa: scope.admin1NameJa,
        admin2Code: scope.admin2Code,
        admin2NameJa: scope.admin2NameJa,
        datasetVersion: scope.datasetVersion
      }
    })
  });

  return scope;
};
