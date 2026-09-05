import {
  AdministrativeRegionLevel,
  ContentLocale,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  AdministrativeRegionListQuery,
  VerifiedServiceLocationInput
} from "../validators/administrative-region.validator";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";

type AdministrativeRegionClient = PrismaClient | Prisma.TransactionClient;

const localeByPublicCode = {
  "zh-CN": ContentLocale.ZH_CN,
  "zh-TW": ContentLocale.ZH_TW,
  ja: ContentLocale.JA,
  en: ContentLocale.EN,
  ko: ContentLocale.KO
} as const;

export interface AdministrativeRegionListItem {
  code: string;
  name: string;
  level: "country" | "admin1" | "admin2";
  parentCode: string | null;
  centroid: { lat: number; lng: number } | null;
}

export interface VerifiedAdministrativeRegionScope extends VerifiedServiceLocationInput {
  admin1RegionId: number;
  admin1NameJa: string;
  admin2RegionId: number;
  admin2NameJa: string;
  datasetVersion: "N03-20260101";
}

export interface AdministrativeRegionRepositoryPort {
  listChildren: (input: AdministrativeRegionListQuery) => Promise<AdministrativeRegionListItem[]>;
  resolveVerifiedScope: (
    input: VerifiedServiceLocationInput,
    transaction?: Prisma.TransactionClient
  ) => Promise<VerifiedAdministrativeRegionScope>;
}

export class AdministrativeRegionRepository implements AdministrativeRegionRepositoryPort {
  public constructor(private readonly client: AdministrativeRegionClient = prisma) {}

  public async listChildren(
    input: AdministrativeRegionListQuery
  ): Promise<AdministrativeRegionListItem[]> {
    const requestedLocale = localeByPublicCode[input.locale];
    let parentId: number | undefined;

    if (input.parent) {
      const parent = await this.client.administrativeRegion.findFirst({
        where: {
          countryCode: input.country,
          officialCode: input.parent,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!parent) return [];
      parentId = parent.id;
    }

    const rows = await this.client.administrativeRegion.findMany({
      where: {
        countryCode: input.country,
        deletedAt: null,
        ...(parentId === undefined ? { level: AdministrativeRegionLevel.ADMIN1 } : { parentId })
      },
      select: {
        officialCode: true,
        level: true,
        centroidLat: true,
        centroidLng: true,
        parent: { select: { officialCode: true } },
        locales: {
          where: {
            locale: { in: [...new Set([requestedLocale, ContentLocale.JA])] },
            deletedAt: null
          },
          select: { locale: true, name: true }
        }
      },
      orderBy: [{ officialCode: "asc" }, { id: "asc" }]
    });

    return rows.map((row) => {
      const name =
        row.locales.find((locale) => locale.locale === requestedLocale)?.name ??
        row.locales.find((locale) => locale.locale === ContentLocale.JA)?.name;
      if (!name) throw this.invalidHierarchyError();

      return {
        code: row.officialCode,
        name,
        level: row.level.toLowerCase() as AdministrativeRegionListItem["level"],
        parentCode: row.parent?.officialCode ?? null,
        centroid:
          row.centroidLat === null || row.centroidLng === null
            ? null
            : { lat: Number(row.centroidLat), lng: Number(row.centroidLng) }
      };
    });
  }

  public async resolveVerifiedScope(
    input: VerifiedServiceLocationInput,
    transaction?: Prisma.TransactionClient
  ): Promise<VerifiedAdministrativeRegionScope> {
    const client = transaction ?? this.client;
    const rows = await client.administrativeRegion.findMany({
      where: {
        countryCode: input.countryCode,
        officialCode: { in: [input.admin1Code, input.admin2Code] },
        sourceVersion: "N03-20260101",
        deletedAt: null
      },
      select: {
        id: true,
        officialCode: true,
        level: true,
        parentId: true,
        locales: {
          where: { locale: ContentLocale.JA, deletedAt: null },
          select: { name: true },
          take: 1
        }
      }
    });
    const admin1 = rows.find(
      (row) =>
        row.officialCode === input.admin1Code && row.level === AdministrativeRegionLevel.ADMIN1
    );
    const admin2 = rows.find(
      (row) =>
        row.officialCode === input.admin2Code && row.level === AdministrativeRegionLevel.ADMIN2
    );
    const admin1NameJa = admin1?.locales[0]?.name;
    const admin2NameJa = admin2?.locales[0]?.name;
    if (!admin1 || !admin2 || admin2.parentId !== admin1.id || !admin1NameJa || !admin2NameJa) {
      throw this.invalidHierarchyError();
    }

    return {
      ...input,
      admin1RegionId: admin1.id,
      admin1NameJa,
      admin2RegionId: admin2.id,
      admin2NameJa,
      datasetVersion: "N03-20260101"
    };
  }

  private invalidHierarchyError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.administrative_region.invalid_hierarchy",
      statusCode: 400
    });
  }
}
