import { ERROR_CODES } from "../constants/error-codes";
import type {
  ImMessageTranslationCacheEntry,
  ImMessageTranslationRepositoryPort,
  TranslationCacheKey
} from "../repositories/im-message-translation.repository";
import {
  extractImMessageTranslationSource,
  hashImMessageTranslationSource
} from "../repositories/im-message-translation.repository";
import { AppError } from "../utils/app-error";
import type {
  PersonalIdentityActor,
  PersonalIdentityScopeService
} from "./personal-identity-scope.service";
import type { ImTranslationTargetLanguage, TranslationProvider } from "./im-translation.provider";

export interface ImMessageTranslationCommand {
  conversationId: number;
  messageIds: number[];
  targetLanguage: ImTranslationTargetLanguage;
}

export type ImMessageTranslationResult =
  | { messageId: number; status: "ineligible" | "same_language" }
  | { messageId: number; status: "translated"; translatedContent: string };

interface EligibleMessage {
  messageId: number;
  source: string;
  sourceContentHash: string;
  cacheKey: TranslationCacheKey;
}

const kanaPattern = /[\u3040-\u30ff\uff66-\uff9f]/u;
const hangulPattern = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;

const cacheKeyString = (key: TranslationCacheKey): string =>
  `${key.messageId}:${key.sourceContentHash}:${key.targetLanguage}:${key.providerKey}`;

const normalizedDetectedLanguage = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = value.toUpperCase();
  if (normalized === "JA") return "ja";
  if (normalized === "KO") return "ko";
  if (normalized.startsWith("EN")) return "en";
  if (normalized.startsWith("ZH")) return "zh";
  return normalized.toLowerCase();
};

const isSameLanguage = (
  sourceLanguage: string | null,
  targetLanguage: ImTranslationTargetLanguage
): boolean => {
  const normalized = normalizedDetectedLanguage(sourceLanguage);
  if (targetLanguage === "zh" || targetLanguage === "zh-Hant") return normalized === "zh";
  return normalized === targetLanguage;
};

export const detectObviousSourceLanguage = (source: string): "ja" | "ko" | null => {
  const hasKana = kanaPattern.test(source);
  const hasHangul = hangulPattern.test(source);
  if (hasKana && !hasHangul) return "ja";
  if (hasHangul && !hasKana) return "ko";
  return null;
};

export class ImMessageTranslationService {
  public constructor(
    private readonly repository: ImMessageTranslationRepositoryPort,
    private readonly personalIdentityScope: Pick<PersonalIdentityScopeService, "resolve">,
    private readonly provider: TranslationProvider,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async translateVisibleMessages(
    actor: PersonalIdentityActor,
    command: ImMessageTranslationCommand
  ): Promise<ImMessageTranslationResult[]> {
    this.assertCommand(command);
    const scope = await this.personalIdentityScope.resolve(actor);
    const messages = await this.repository.loadVisibleMessages({
      conversationId: command.conversationId,
      userId: scope.userId,
      identityId: scope.identityId,
      messageIds: command.messageIds,
      now: this.now()
    });
    const messagesById = new Map(messages.map((message) => [message.id, message]));
    if (messagesById.size !== command.messageIds.length) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.im.translation_message_not_found",
        statusCode: 404
      });
    }

    const ordered = command.messageIds.map((messageId) => messagesById.get(messageId)!);
    const eligibleByMessageId = new Map<number, EligibleMessage>();
    for (const message of ordered) {
      const source = extractImMessageTranslationSource(message);
      if (source === null) continue;
      const sourceContentHash = hashImMessageTranslationSource(source);
      eligibleByMessageId.set(message.id, {
        messageId: message.id,
        source,
        sourceContentHash,
        cacheKey: {
          messageId: message.id,
          sourceContentHash,
          targetLanguage: command.targetLanguage,
          providerKey: this.provider.key
        }
      });
    }

    const eligible = [...eligibleByMessageId.values()];
    const cached = await this.repository.findCachedTranslations(
      eligible.map((item) => item.cacheKey)
    );
    const cacheByKey = new Map(cached.map((entry) => [cacheKeyString(entry), entry]));
    const results = new Map<number, ImMessageTranslationResult>();
    const providerCandidates: EligibleMessage[] = [];
    const requiredCacheKeys: TranslationCacheKey[] = [];

    for (const item of eligible) {
      const cachedEntry = cacheByKey.get(cacheKeyString(item.cacheKey));
      if (cachedEntry) {
        results.set(item.messageId, this.resultFromCache(cachedEntry, command.targetLanguage));
        requiredCacheKeys.push(item.cacheKey);
      } else if (detectObviousSourceLanguage(item.source) === command.targetLanguage) {
        results.set(item.messageId, { messageId: item.messageId, status: "same_language" });
      } else {
        providerCandidates.push(item);
      }
    }

    const writes =
      providerCandidates.length > 0
        ? await this.translateProviderCandidates(
            providerCandidates,
            command.targetLanguage,
            results
          )
        : [];

    const finalized = await this.repository.finalizeTranslations({
      conversationId: command.conversationId,
      userId: scope.userId,
      identityId: scope.identityId,
      messageIds: command.messageIds,
      expectedMessages: ordered.map((message) => {
        const source = extractImMessageTranslationSource(message);
        return {
          messageId: message.id,
          source,
          sourceContentHash: source === null ? null : hashImMessageTranslationSource(source)
        };
      }),
      requiredCacheKeys,
      writes,
      now: this.now()
    });
    if (finalized === "not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.im.translation_message_not_found",
        statusCode: 404
      });
    }
    if (finalized === "cache_conflict") {
      throw new AppError({
        code: ERROR_CODES.IM_TRANSLATION_CACHE_CONFLICT,
        message: "error.im.translation_cache_conflict",
        statusCode: 409
      });
    }

    return ordered.map(
      (message) =>
        results.get(message.id) ?? { messageId: message.id, status: "ineligible" as const }
    );
  }

  private async translateProviderCandidates(
    candidates: EligibleMessage[],
    targetLanguage: ImTranslationTargetLanguage,
    results: Map<number, ImMessageTranslationResult>
  ): Promise<ImMessageTranslationCacheEntry[]> {
    const uniqueSources: string[] = [];
    const sourceIndexes = new Map<string, number>();
    for (const candidate of candidates) {
      if (!sourceIndexes.has(candidate.source)) {
        sourceIndexes.set(candidate.source, uniqueSources.length);
        uniqueSources.push(candidate.source);
      }
    }

    const providerResult = await this.provider.translate({ texts: uniqueSources, targetLanguage });
    if (
      providerResult.texts.length !== uniqueSources.length ||
      providerResult.detectedSourceLanguages.length !== uniqueSources.length ||
      (providerResult.providerRequestIds !== undefined &&
        providerResult.providerRequestIds.length !== uniqueSources.length)
    ) {
      throw new AppError({
        code: ERROR_CODES.IM_TRANSLATION_PROVIDER_UNAVAILABLE,
        message: "error.im.translation_provider_invalid_response",
        statusCode: 503
      });
    }

    const entries: ImMessageTranslationCacheEntry[] = candidates.map((candidate) => {
      const index = sourceIndexes.get(candidate.source)!;
      return {
        ...candidate.cacheKey,
        sourceLanguage: providerResult.detectedSourceLanguages[index] ?? null,
        translatedContent: providerResult.texts[index]!,
        providerRequestId:
          providerResult.providerRequestIds?.[index] ?? providerResult.providerRequestId
      };
    });

    for (const entry of entries) {
      results.set(entry.messageId, this.resultFromCache(entry, targetLanguage));
    }
    return entries;
  }

  private resultFromCache(
    entry: ImMessageTranslationCacheEntry,
    targetLanguage: ImTranslationTargetLanguage
  ): ImMessageTranslationResult {
    if (isSameLanguage(entry.sourceLanguage, targetLanguage)) {
      return { messageId: entry.messageId, status: "same_language" };
    }
    return {
      messageId: entry.messageId,
      status: "translated",
      translatedContent: entry.translatedContent
    };
  }

  private assertCommand(command: ImMessageTranslationCommand): void {
    const idsAreValid = command.messageIds.every(
      (messageId) => Number.isSafeInteger(messageId) && messageId > 0
    );
    if (
      !Number.isSafeInteger(command.conversationId) ||
      command.conversationId <= 0 ||
      command.messageIds.length < 1 ||
      command.messageIds.length > 50 ||
      new Set(command.messageIds).size !== command.messageIds.length ||
      !idsAreValid
    ) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.validation",
        statusCode: 400
      });
    }
  }
}
