import {
  AdministrativeRegionLevel,
  type Prisma
} from "@prisma/client";

import {
  ADMINISTRATIVE_REGION_DATASET_VERSION,
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

export interface ShopServiceLocationValidityRecord {
  countryCode: string;
  admin1RegionId: number;
  admin2RegionId: number;
  datasetVersion: string;
  deletedAt: Date | null;
  admin1Region: {
    id: number;
    countryCode: string;
    officialCode: string;
    sourceVersion: string;
    level: AdministrativeRegionLevel;
    parentId: number | null;
    deletedAt: Date | null;
    locales: Array<{ name: string }>;
  };
  admin2Region: {
    id: number;
    countryCode: string;
    officialCode: string;
    sourceVersion: string;
    level: AdministrativeRegionLevel;
    parentId: number | null;
    deletedAt: Date | null;
    locales: Array<{ name: string }>;
  };
}

export const isCurrentVerifiedShopServiceLocation = (
  location: ShopServiceLocationValidityRecord | null,
  expected?: VerifiedServiceLocationInput
): boolean =>
  Boolean(
    location &&
      location.deletedAt === null &&
      location.countryCode === "JP" &&
      location.datasetVersion === ADMINISTRATIVE_REGION_DATASET_VERSION &&
      location.admin1RegionId === location.admin1Region.id &&
      location.admin2RegionId === location.admin2Region.id &&
      location.admin1Region.countryCode === "JP" &&
      location.admin2Region.countryCode === "JP" &&
      location.admin1Region.sourceVersion === ADMINISTRATIVE_REGION_DATASET_VERSION &&
      location.admin2Region.sourceVersion === ADMINISTRATIVE_REGION_DATASET_VERSION &&
      location.admin1Region.level === AdministrativeRegionLevel.ADMIN1 &&
      location.admin2Region.level === AdministrativeRegionLevel.ADMIN2 &&
      location.admin2Region.parentId === location.admin1Region.id &&
      location.admin1Region.deletedAt === null &&
      location.admin2Region.deletedAt === null &&
      location.admin1Region.locales.some((locale) => locale.name.trim().length > 0) &&
      location.admin2Region.locales.some((locale) => locale.name.trim().length > 0) &&
      (!expected ||
        (expected.countryCode === location.countryCode &&
          expected.admin1Code === location.admin1Region.officialCode &&
          expected.admin2Code === location.admin2Region.officialCode))
  );

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
