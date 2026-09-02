import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";

export interface ResolvedSearchTaxonomy {
  categoryId: number;
  businessKeywordId: number;
}

export interface SearchQueryEventCreateInput {
  originalKeyword: string;
  normalizedKeyword: string;
  city?: string;
  entityType: "service" | "shop" | "technician";
  categoryId?: number;
  businessKeywordId?: number;
  resultCount: number;
  anonymousSessionHash?: string;
}

export interface SearchQueryRecorderRepositoryPort {
  resolveTaxonomy: (normalizedKeyword: string) => Promise<ResolvedSearchTaxonomy | null>;
  createEvents: (events: SearchQueryEventCreateInput[]) => Promise<void>;
}

type SearchQueryRecorderClient = PrismaClient | Prisma.TransactionClient;

export class SearchQueryRecorderRepository implements SearchQueryRecorderRepositoryPort {
  public constructor(private readonly client: SearchQueryRecorderClient = prisma) {}

  public async resolveTaxonomy(
    normalizedKeyword: string
  ): Promise<ResolvedSearchTaxonomy | null> {
    const alias = await this.client.searchKeywordAlias.findFirst({
      where: {
        normalizedAlias: normalizedKeyword,
        isActive: true,
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        businessKeyword: { isActive: true, deletedAt: null }
      },
      orderBy: [{ id: "asc" }],
      select: { categoryId: true, businessKeywordId: true }
    });
    if (alias) return alias;

    const keyword = await this.client.businessKeyword.findFirst({
      where: {
        isActive: true,
        deletedAt: null,
        category: { isActive: true, deletedAt: null },
        OR: [
          { code: normalizedKeyword },
          {
            translations: {
              some: { label: normalizedKeyword, deletedAt: null }
            }
          }
        ]
      },
      orderBy: [{ id: "asc" }],
      select: { id: true, categoryId: true }
    });
    return keyword ? { categoryId: keyword.categoryId, businessKeywordId: keyword.id } : null;
  }

  public async createEvents(events: SearchQueryEventCreateInput[]): Promise<void> {
    if (events.length === 0) return;
    await this.client.searchQueryEvent.createMany({
      data: events.map((event) => ({
        originalKeyword: event.originalKeyword,
        normalizedKeyword: event.normalizedKeyword,
        city: event.city,
        entityType: event.entityType,
        categoryId: event.categoryId,
        businessKeywordId: event.businessKeywordId,
        resultCount: event.resultCount,
        anonymousSessionHash: event.anonymousSessionHash
      }))
    });
  }
}
