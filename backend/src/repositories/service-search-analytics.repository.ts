import { Prisma, type PrismaClient, type TaxonomyLocale } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export interface LocalizedNameInput {
  locale: TaxonomyLocale;
  value: string;
}

export interface ServiceTaxonomyCategoryRecord {
  id: number;
  code: string;
  sortOrder: number;
  isActive: boolean;
  configurationVersion: number;
  translations: LocalizedNameInput[];
  keywordCount: number;
  updatedAt: Date;
}

export interface ServiceTaxonomyKeywordRecord {
  id: number;
  categoryId: number;
  code: string;
  sortOrder: number;
  isActive: boolean;
  configurationVersion: number;
  translations: LocalizedNameInput[];
  aliasCount: number;
  updatedAt: Date;
}

export interface SearchKeywordAliasRecord {
  id: number;
  categoryId: number;
  businessKeywordId: number;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
  configurationVersion: number;
  updatedAt: Date;
}

export interface TaxonomyListInput extends PaginationInput {
  keyword?: string;
  categoryId?: number;
  businessKeywordId?: number;
}

export interface TaxonomyMutationContext {
  actorUserId: number;
  audit: AuditLogCreateInput;
}

export interface CategoryMutationInput extends TaxonomyMutationContext {
  code: string;
  sortOrder: number;
  isActive: boolean;
  translations: LocalizedNameInput[];
  expectedVersion?: number;
}

export interface KeywordMutationInput extends TaxonomyMutationContext {
  categoryId: number;
  code: string;
  sortOrder: number;
  isActive: boolean;
  translations: LocalizedNameInput[];
  expectedVersion?: number;
}

export interface AliasMutationInput extends TaxonomyMutationContext {
  categoryId: number;
  businessKeywordId: number;
  alias: string;
  normalizedAlias: string;
  isActive: boolean;
  expectedVersion?: number;
}

export type TaxonomyMutationResult<T> =
  | { outcome: "saved"; value: T }
  | { outcome: "not_found" | "conflict" | "invalid_relation" };

export interface SearchAnalyticsFilter {
  startAt: Date;
  endAt: Date;
  city?: string;
  categoryId?: number;
}

export interface SearchKeywordRankRecord {
  normalizedKeyword: string;
  searchCount: number;
  resultCount: number;
  firstEventId: number;
}

export interface SearchKeywordTrendRecord {
  date: string;
  normalizedKeyword: string;
  searchCount: number;
}

export interface ServiceSearchAnalyticsRepositoryPort {
  listCategories: (
    input: TaxonomyListInput
  ) => Promise<PaginatedResponse<ServiceTaxonomyCategoryRecord>>;
  listKeywords: (
    input: TaxonomyListInput & { categoryId: number }
  ) => Promise<PaginatedResponse<ServiceTaxonomyKeywordRecord>>;
  listAliases: (
    input: TaxonomyListInput & { businessKeywordId: number }
  ) => Promise<PaginatedResponse<SearchKeywordAliasRecord>>;
  createCategory: (
    input: CategoryMutationInput
  ) => Promise<TaxonomyMutationResult<ServiceTaxonomyCategoryRecord>>;
  updateCategory: (
    id: number,
    input: CategoryMutationInput
  ) => Promise<TaxonomyMutationResult<ServiceTaxonomyCategoryRecord>>;
  createKeyword: (
    input: KeywordMutationInput
  ) => Promise<TaxonomyMutationResult<ServiceTaxonomyKeywordRecord>>;
  updateKeyword: (
    id: number,
    input: KeywordMutationInput
  ) => Promise<TaxonomyMutationResult<ServiceTaxonomyKeywordRecord>>;
  createAlias: (
    input: AliasMutationInput
  ) => Promise<TaxonomyMutationResult<SearchKeywordAliasRecord>>;
  updateAlias: (
    id: number,
    input: AliasMutationInput
  ) => Promise<TaxonomyMutationResult<SearchKeywordAliasRecord>>;
  topKeywords: (filter: SearchAnalyticsFilter) => Promise<SearchKeywordRankRecord[]>;
  keywordTrend: (
    filter: SearchAnalyticsFilter,
    normalizedKeywords: string[]
  ) => Promise<SearchKeywordTrendRecord[]>;
}

type Client = PrismaClient | Prisma.TransactionClient;

const categorySelect = {
  id: true,
  code: true,
  sortOrder: true,
  isActive: true,
  configurationVersion: true,
  updatedAt: true,
  translations: {
    where: { deletedAt: null },
    orderBy: [{ locale: "asc" as const }],
    select: { locale: true, name: true }
  },
  _count: { select: { businessKeywords: { where: { deletedAt: null } } } }
} as const satisfies Prisma.CategorySelect;

const keywordSelect = {
  id: true,
  categoryId: true,
  code: true,
  sortOrder: true,
  isActive: true,
  configurationVersion: true,
  updatedAt: true,
  translations: {
    where: { deletedAt: null },
    orderBy: [{ locale: "asc" as const }],
    select: { locale: true, label: true }
  },
  _count: { select: { searchAliases: { where: { deletedAt: null } } } }
} as const satisfies Prisma.BusinessKeywordSelect;

const aliasSelect = {
  id: true,
  categoryId: true,
  businessKeywordId: true,
  alias: true,
  normalizedAlias: true,
  isActive: true,
  configurationVersion: true,
  updatedAt: true
} as const satisfies Prisma.SearchKeywordAliasSelect;

type StoredCategory = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>;
type StoredKeyword = Prisma.BusinessKeywordGetPayload<{ select: typeof keywordSelect }>;
type StoredAlias = Prisma.SearchKeywordAliasGetPayload<{ select: typeof aliasSelect }>;

interface TopRow {
  normalizedKeyword: string;
  searchCount: bigint | number;
  resultCount: bigint | number;
  firstEventId: bigint | number;
}

interface TrendRow {
  date: Date | string;
  normalizedKeyword: string;
  searchCount: bigint | number;
}

export class ServiceSearchAnalyticsRepository implements ServiceSearchAnalyticsRepositoryPort {
  public constructor(private readonly client: Client = prisma) {}

  public async listCategories(
    input: TaxonomyListInput
  ): Promise<PaginatedResponse<ServiceTaxonomyCategoryRecord>> {
    const page = toPrismaPagination(input);
    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(input.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { translations: { some: { name: { contains: input.keyword }, deletedAt: null } } }
            ]
          }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.category.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
        select: categorySelect
      }),
      this.client.category.count({ where })
    ]);
    return buildPaginatedResponse(list.map(this.serializeCategory), total, input);
  }

  public async listKeywords(
    input: TaxonomyListInput & { categoryId: number }
  ): Promise<PaginatedResponse<ServiceTaxonomyKeywordRecord>> {
    const page = toPrismaPagination(input);
    const where: Prisma.BusinessKeywordWhereInput = {
      categoryId: input.categoryId,
      deletedAt: null,
      ...(input.keyword
        ? {
            OR: [
              { code: { contains: input.keyword } },
              { translations: { some: { label: { contains: input.keyword }, deletedAt: null } } }
            ]
          }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.businessKeyword.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
        select: keywordSelect
      }),
      this.client.businessKeyword.count({ where })
    ]);
    return buildPaginatedResponse(list.map(this.serializeKeyword), total, input);
  }

  public async listAliases(
    input: TaxonomyListInput & { businessKeywordId: number }
  ): Promise<PaginatedResponse<SearchKeywordAliasRecord>> {
    const page = toPrismaPagination(input);
    const where: Prisma.SearchKeywordAliasWhereInput = {
      businessKeywordId: input.businessKeywordId,
      deletedAt: null,
      ...(input.keyword
        ? { OR: [{ alias: { contains: input.keyword } }, { normalizedAlias: { contains: input.keyword } }] }
        : {})
    };
    const [list, total] = await Promise.all([
      this.client.searchKeywordAlias.findMany({
        where,
        orderBy: [{ alias: "asc" }, { id: "asc" }],
        skip: page.skip,
        take: page.take,
        select: aliasSelect
      }),
      this.client.searchKeywordAlias.count({ where })
    ]);
    return buildPaginatedResponse(list.map(this.serializeAlias), total, input);
  }

  public createCategory(
    input: CategoryMutationInput
  ): Promise<TaxonomyMutationResult<ServiceTaxonomyCategoryRecord>> {
    return this.inTransaction(async (tx) => {
      if (await tx.category.findFirst({ where: { code: input.code, deletedAt: null }, select: { id: true } })) {
        return { outcome: "conflict" };
      }
      const primary = input.translations[0]?.value ?? input.code;
      const created = await tx.category.create({
        data: {
          code: input.code,
          name: primary,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          translations: {
            create: input.translations.map((item) => ({ locale: item.locale, name: item.value }))
          }
        },
        select: categorySelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: created.id }) });
      return { outcome: "saved", value: this.serializeCategory(created) };
    });
  }

  public updateCategory(
    id: number,
    input: CategoryMutationInput
  ): Promise<TaxonomyMutationResult<ServiceTaxonomyCategoryRecord>> {
    return this.inTransaction(async (tx) => {
      const current = await tx.category.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, configurationVersion: true }
      });
      if (!current) return { outcome: "not_found" };
      if (current.configurationVersion !== input.expectedVersion) return { outcome: "conflict" };
      const duplicate = await tx.category.findFirst({
        where: { code: input.code, deletedAt: null, NOT: { id } },
        select: { id: true }
      });
      if (duplicate) return { outcome: "conflict" };
      await this.replaceCategoryTranslations(tx, id, input.translations);
      const updated = await tx.category.update({
        where: { id },
        data: {
          code: input.code,
          name: input.translations[0]?.value ?? input.code,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          configurationVersion: { increment: 1 }
        },
        select: categorySelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: id }) });
      return { outcome: "saved", value: this.serializeCategory(updated) };
    });
  }

  public createKeyword(
    input: KeywordMutationInput
  ): Promise<TaxonomyMutationResult<ServiceTaxonomyKeywordRecord>> {
    return this.inTransaction(async (tx) => {
      if (!(await this.activeCategoryExists(tx, input.categoryId))) return { outcome: "invalid_relation" };
      if (await tx.businessKeyword.findFirst({ where: { code: input.code, deletedAt: null }, select: { id: true } })) {
        return { outcome: "conflict" };
      }
      const created = await tx.businessKeyword.create({
        data: {
          categoryId: input.categoryId,
          code: input.code,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          translations: {
            create: input.translations.map((item) => ({ locale: item.locale, label: item.value }))
          }
        },
        select: keywordSelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: created.id }) });
      return { outcome: "saved", value: this.serializeKeyword(created) };
    });
  }

  public updateKeyword(
    id: number,
    input: KeywordMutationInput
  ): Promise<TaxonomyMutationResult<ServiceTaxonomyKeywordRecord>> {
    return this.inTransaction(async (tx) => {
      const current = await tx.businessKeyword.findFirst({
        where: { id, deletedAt: null },
        select: { configurationVersion: true }
      });
      if (!current) return { outcome: "not_found" };
      if (current.configurationVersion !== input.expectedVersion) return { outcome: "conflict" };
      if (!(await this.activeCategoryExists(tx, input.categoryId))) return { outcome: "invalid_relation" };
      const duplicate = await tx.businessKeyword.findFirst({
        where: { code: input.code, deletedAt: null, NOT: { id } },
        select: { id: true }
      });
      if (duplicate) return { outcome: "conflict" };
      await this.replaceKeywordTranslations(tx, id, input.translations);
      const updated = await tx.businessKeyword.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          code: input.code,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
          configurationVersion: { increment: 1 }
        },
        select: keywordSelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: id }) });
      return { outcome: "saved", value: this.serializeKeyword(updated) };
    });
  }

  public createAlias(
    input: AliasMutationInput
  ): Promise<TaxonomyMutationResult<SearchKeywordAliasRecord>> {
    return this.inTransaction(async (tx) => {
      if (!(await this.keywordBelongsToCategory(tx, input.businessKeywordId, input.categoryId))) {
        return { outcome: "invalid_relation" };
      }
      if (await this.aliasExists(tx, input.normalizedAlias)) return { outcome: "conflict" };
      const created = await tx.searchKeywordAlias.create({
        data: {
          categoryId: input.categoryId,
          businessKeywordId: input.businessKeywordId,
          alias: input.alias,
          normalizedAlias: input.normalizedAlias,
          isActive: input.isActive
        },
        select: aliasSelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: created.id }) });
      return { outcome: "saved", value: this.serializeAlias(created) };
    });
  }

  public updateAlias(
    id: number,
    input: AliasMutationInput
  ): Promise<TaxonomyMutationResult<SearchKeywordAliasRecord>> {
    return this.inTransaction(async (tx) => {
      const current = await tx.searchKeywordAlias.findFirst({
        where: { id, deletedAt: null },
        select: { configurationVersion: true }
      });
      if (!current) return { outcome: "not_found" };
      if (current.configurationVersion !== input.expectedVersion) return { outcome: "conflict" };
      if (!(await this.keywordBelongsToCategory(tx, input.businessKeywordId, input.categoryId))) {
        return { outcome: "invalid_relation" };
      }
      if (await this.aliasExists(tx, input.normalizedAlias, id)) return { outcome: "conflict" };
      const updated = await tx.searchKeywordAlias.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          businessKeywordId: input.businessKeywordId,
          alias: input.alias,
          normalizedAlias: input.normalizedAlias,
          isActive: input.isActive,
          configurationVersion: { increment: 1 }
        },
        select: aliasSelect
      });
      await tx.auditLog.create({ data: toAuditLogCreateData({ ...input.audit, targetId: id }) });
      return { outcome: "saved", value: this.serializeAlias(updated) };
    });
  }

  public async topKeywords(filter: SearchAnalyticsFilter): Promise<SearchKeywordRankRecord[]> {
    const where = this.analyticsWhere(filter);
    const rows = await this.client.$queryRaw<TopRow[]>(Prisma.sql`
      SELECT
        normalized_keyword AS normalizedKeyword,
        COUNT(*) AS searchCount,
        COALESCE(SUM(result_count), 0) AS resultCount,
        MIN(id) AS firstEventId
      FROM search_query_events
      WHERE ${where}
      GROUP BY normalized_keyword
      ORDER BY searchCount DESC, firstEventId ASC, normalizedKeyword ASC
      LIMIT 10
    `);
    return rows.map((row) => ({
      normalizedKeyword: row.normalizedKeyword,
      searchCount: Number(row.searchCount),
      resultCount: Number(row.resultCount),
      firstEventId: Number(row.firstEventId)
    }));
  }

  public async keywordTrend(
    filter: SearchAnalyticsFilter,
    normalizedKeywords: string[]
  ): Promise<SearchKeywordTrendRecord[]> {
    if (normalizedKeywords.length === 0) return [];
    const where = this.analyticsWhere(filter);
    const rows = await this.client.$queryRaw<TrendRow[]>(Prisma.sql`
      SELECT
        DATE(CONVERT_TZ(searched_at, '+00:00', '+09:00')) AS date,
        normalized_keyword AS normalizedKeyword,
        COUNT(*) AS searchCount
      FROM search_query_events
      WHERE ${where}
        AND normalized_keyword IN (${Prisma.join(normalizedKeywords)})
      GROUP BY DATE(CONVERT_TZ(searched_at, '+00:00', '+09:00')), normalized_keyword
      ORDER BY date ASC, normalizedKeyword ASC
    `);
    return rows.map((row) => ({
      date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
      normalizedKeyword: row.normalizedKeyword,
      searchCount: Number(row.searchCount)
    }));
  }

  private analyticsWhere(filter: SearchAnalyticsFilter): Prisma.Sql {
    const clauses: Prisma.Sql[] = [
      Prisma.sql`deleted_at IS NULL`,
      Prisma.sql`searched_at >= ${filter.startAt}`,
      Prisma.sql`searched_at < ${filter.endAt}`
    ];
    if (filter.city) clauses.push(Prisma.sql`city = ${filter.city}`);
    if (filter.categoryId) clauses.push(Prisma.sql`category_id = ${filter.categoryId}`);
    return Prisma.join(clauses, " AND ");
  }

  private async replaceCategoryTranslations(
    tx: Prisma.TransactionClient,
    categoryId: number,
    translations: LocalizedNameInput[]
  ): Promise<void> {
    const locales = translations.map((item) => item.locale);
    await tx.categoryTranslation.updateMany({
      where: { categoryId, deletedAt: null, locale: { notIn: locales } },
      data: { deletedAt: new Date() }
    });
    for (const item of translations) {
      await tx.categoryTranslation.upsert({
        where: { categoryId_locale: { categoryId, locale: item.locale } },
        create: { categoryId, locale: item.locale, name: item.value },
        update: { name: item.value, deletedAt: null }
      });
    }
  }

  private async replaceKeywordTranslations(
    tx: Prisma.TransactionClient,
    businessKeywordId: number,
    translations: LocalizedNameInput[]
  ): Promise<void> {
    const locales = translations.map((item) => item.locale);
    await tx.businessKeywordTranslation.updateMany({
      where: { businessKeywordId, deletedAt: null, locale: { notIn: locales } },
      data: { deletedAt: new Date() }
    });
    for (const item of translations) {
      await tx.businessKeywordTranslation.upsert({
        where: { businessKeywordId_locale: { businessKeywordId, locale: item.locale } },
        create: { businessKeywordId, locale: item.locale, label: item.value },
        update: { label: item.value, deletedAt: null }
      });
    }
  }

  private activeCategoryExists(tx: Prisma.TransactionClient, id: number): Promise<boolean> {
    return tx.category
      .findFirst({ where: { id, deletedAt: null }, select: { id: true } })
      .then(Boolean);
  }

  private keywordBelongsToCategory(
    tx: Prisma.TransactionClient,
    businessKeywordId: number,
    categoryId: number
  ): Promise<boolean> {
    return tx.businessKeyword
      .findFirst({
        where: { id: businessKeywordId, categoryId, deletedAt: null },
        select: { id: true }
      })
      .then(Boolean);
  }

  private aliasExists(
    tx: Prisma.TransactionClient,
    normalizedAlias: string,
    excludedId?: number
  ): Promise<boolean> {
    return tx.searchKeywordAlias
      .findFirst({
        where: {
          normalizedAlias,
          deletedAt: null,
          ...(excludedId ? { NOT: { id: excludedId } } : {})
        },
        select: { id: true }
      })
      .then(Boolean);
  }

  private inTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    if ("$transaction" in this.client) return this.client.$transaction(operation);
    return operation(this.client);
  }

  private serializeCategory = (value: StoredCategory): ServiceTaxonomyCategoryRecord => ({
    id: value.id,
    code: value.code,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    configurationVersion: value.configurationVersion,
    translations: value.translations.map((item) => ({ locale: item.locale, value: item.name })),
    keywordCount: value._count.businessKeywords,
    updatedAt: value.updatedAt
  });

  private serializeKeyword = (value: StoredKeyword): ServiceTaxonomyKeywordRecord => ({
    id: value.id,
    categoryId: value.categoryId,
    code: value.code,
    sortOrder: value.sortOrder,
    isActive: value.isActive,
    configurationVersion: value.configurationVersion,
    translations: value.translations.map((item) => ({ locale: item.locale, value: item.label })),
    aliasCount: value._count.searchAliases,
    updatedAt: value.updatedAt
  });

  private serializeAlias = (value: StoredAlias): SearchKeywordAliasRecord => ({ ...value });
}
