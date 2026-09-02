import { createHmac } from "node:crypto";
import type { CoreSearchInput } from "../repositories/core-read.repository";
import type { SearchQueryRecorderRepositoryPort } from "../repositories/search-query-recorder.repository";

export interface SuccessfulSearchRecordInput {
  input: CoreSearchInput;
  resultCount: number;
  anonymousSessionId?: string;
}

export interface SearchQueryRecorderPort {
  recordSuccessfulSearch: (input: SuccessfulSearchRecordInput) => Promise<void>;
}

export const normalizeSearchKeyword = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("ja-JP");

export class SearchQueryRecorderService implements SearchQueryRecorderPort {
  public constructor(
    private readonly repository: SearchQueryRecorderRepositoryPort,
    private readonly hmacSecret: string
  ) {}

  public async recordSuccessfulSearch(input: SuccessfulSearchRecordInput): Promise<void> {
    const submitted = [input.input.keyword, ...input.input.keywords].filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );
    const distinct = new Map<string, string>();
    for (const original of submitted) {
      const normalized = normalizeSearchKeyword(original);
      if (normalized.length > 0 && !distinct.has(normalized)) distinct.set(normalized, original.trim());
    }
    if (distinct.size === 0) return;

    const selectedCategoryId = input.input.categoryIds[0] ?? input.input.categoryId;
    const anonymousSessionHash = this.hashSession(input.anonymousSessionId);
    const events = [];
    for (const [normalizedKeyword, originalKeyword] of distinct) {
      const resolved = await this.repository.resolveTaxonomy(normalizedKeyword);
      events.push({
        originalKeyword,
        normalizedKeyword,
        city: input.input.city,
        entityType: input.input.entityType,
        categoryId: selectedCategoryId ?? resolved?.categoryId,
        businessKeywordId: resolved?.businessKeywordId,
        resultCount: input.resultCount,
        anonymousSessionHash
      });
    }
    await this.repository.createEvents(events);
  }

  private hashSession(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    if (!normalized || normalized.length < 8 || normalized.length > 128) return undefined;
    return createHmac("sha256", this.hmacSecret)
      .update("needo.search-session.v1\0", "utf8")
      .update(normalized, "utf8")
      .digest("hex");
  }
}
