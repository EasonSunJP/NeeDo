import type { Prisma } from "@prisma/client";
import {
  loadAndValidateFormalEnvironment,
  runRollbackOnlyTransaction
} from "./check-order-fulfillment-checkout-flow";

type Client = Prisma.TransactionClient;

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`Service search analytics checker failed: ${message}`);
};

export async function runServiceSearchAnalyticsFlow(transaction: Client): Promise<void> {
  const [analyticsModule, recorderRepositoryModule, recorderServiceModule] = await Promise.all([
    import("../src/repositories/service-search-analytics.repository"),
    import("../src/repositories/search-query-recorder.repository"),
    import("../src/services/search-query-recorder.service")
  ]);
  const { ServiceSearchAnalyticsRepository } = analyticsModule;
  const { SearchQueryRecorderRepository } = recorderRepositoryModule;
  const { SearchQueryRecorderService } = recorderServiceModule;
  const marker = `search-check-${Date.now().toString(36)}`;
  const aliasValue = `${marker}-alias`;
  const category = await transaction.category.create({
    data: {
      code: marker,
      name: "Search checker category",
      translations: { create: [{ locale: "JA", name: "検索チェッカー" }] }
    }
  });
  const keyword = await transaction.businessKeyword.create({
    data: {
      categoryId: category.id,
      code: `${marker}-keyword`,
      translations: { create: [{ locale: "JA", label: "検索チェッカータグ" }] }
    }
  });
  await transaction.searchKeywordAlias.create({
    data: {
      categoryId: category.id,
      businessKeywordId: keyword.id,
      alias: aliasValue,
      normalizedAlias: aliasValue
    }
  });

  const recorder = new SearchQueryRecorderService(
    new SearchQueryRecorderRepository(transaction),
    "rollback-only-search-check-secret"
  );
  const input = {
    entityType: "service" as const,
    keyword: aliasValue,
    keywords: [],
    categoryIds: [],
    city: "東京都",
    page: 1,
    pageSize: 20
  };
  await recorder.recordSuccessfulSearch({ input, resultCount: 4, anonymousSessionId: "search-session-check" });
  await recorder.recordSuccessfulSearch({ input, resultCount: 5, anonymousSessionId: "search-session-check" });

  const recorded = await transaction.searchQueryEvent.findMany({
    where: { categoryId: category.id },
    orderBy: { id: "asc" }
  });
  assert(recorded.length === 2, "successful submitted searches were not recorded exactly once");
  assert(recorded.every((event) => event.businessKeywordId === keyword.id), "alias did not resolve to the formal search tag");
  assert(recorded.every((event) => event.anonymousSessionHash?.length === 64), "session id was not HMAC protected");
  assert(recorded.every((event) => event.anonymousSessionHash !== "search-session-check"), "raw session id was stored");
  await transaction.searchQueryEvent.update({ where: { id: recorded[0]!.id }, data: { searchedAt: new Date("2026-09-02T15:30:00.000Z") } });
  await transaction.searchQueryEvent.update({ where: { id: recorded[1]!.id }, data: { searchedAt: new Date("2026-09-03T15:30:00.000Z") } });
  await transaction.searchQueryEvent.create({
    data: {
      originalKeyword: `${marker}-other`,
      normalizedKeyword: `${marker}-other`,
      city: "東京都",
      entityType: "service",
      categoryId: category.id,
      resultCount: 2,
      searchedAt: new Date("2026-09-02T16:00:00.000Z")
    }
  });

  const repository = new ServiceSearchAnalyticsRepository(transaction);
  const categories = await repository.listCategories({ page: 1, pageSize: 20, keyword: marker });
  assert(categories.total === 1 && categories.list[0]?.translations[0]?.value === "検索チェッカー", "category listing did not return formal localized data");
  const keywords = await repository.listKeywords({ page: 1, pageSize: 20, categoryId: category.id });
  assert(keywords.total === 1 && keywords.list[0]?.aliasCount === 1, "search tag listing did not include alias count");
  const aliases = await repository.listAliases({ page: 1, pageSize: 20, businessKeywordId: keyword.id });
  assert(aliases.total === 1 && aliases.list[0]?.normalizedAlias === aliasValue, "alias listing did not return normalized value");

  const filter = {
    startAt: new Date("2026-09-02T15:00:00.000Z"),
    endAt: new Date("2026-09-04T15:00:00.000Z"),
    city: "東京都",
    categoryId: category.id
  };
  const top = await repository.topKeywords(filter);
  assert(top.length === 2, "TOP10 filter did not isolate the fixture category and city");
  assert(top[0]?.normalizedKeyword === aliasValue && top[0].searchCount === 2, "TOP10 ordering or count is incorrect");
  assert(top[0]?.resultCount === 9, "TOP10 result count aggregation is incorrect");
  const trend = await repository.keywordTrend(filter, [aliasValue]);
  assert(trend.length === 2, "Tokyo natural-day trend did not return both fixture days");
  assert(trend[0]?.date === "2026-09-03" && trend[0].searchCount === 1, "first Tokyo trend day is incorrect");
  assert(trend[1]?.date === "2026-09-04" && trend[1].searchCount === 1, "second Tokyo trend day is incorrect");
}

export async function runServiceSearchAnalyticsCheck(): Promise<void> {
  const formalEnvironment = loadAndValidateFormalEnvironment(process.env);
  for (const [name, value] of Object.entries(formalEnvironment.values)) process.env[name] = value;
  const { prisma } = await import("../src/prisma/client");
  const captureBaseline = async () => ({
    categories: await prisma.category.count({ where: { code: { startsWith: "search-check-" } } }),
    keywords: await prisma.businessKeyword.count({ where: { code: { startsWith: "search-check-" } } }),
    aliases: await prisma.searchKeywordAlias.count({ where: { normalizedAlias: { startsWith: "search-check-" } } }),
    events: await prisma.searchQueryEvent.count({ where: { normalizedKeyword: { startsWith: "search-check-" } } })
  });
  try {
    await runRollbackOnlyTransaction(prisma, captureBaseline, runServiceSearchAnalyticsFlow);
    process.stdout.write("Service search analytics flow verified; ROLLBACK completed.\n");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runServiceSearchAnalyticsCheck().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Service search analytics check failed"}\n`);
    process.exitCode = 1;
  });
}
