import { createHash } from "node:crypto";
import type {
  ImMessageTranslationRepositoryPort,
  VisibleImMessage
} from "../src/repositories/im-message-translation.repository";
import { DeepLTranslationProvider } from "../src/services/deepl-translation.provider";
import { ImMessageTranslationService } from "../src/services/im-message-translation.service";
import type { TranslationProvider } from "../src/services/im-translation.provider";

const auth = {
  userId: 41,
  currentIdentityId: 71,
  currentIdentityType: "customer"
} as const;

const message = (
  id: number,
  content: string | null,
  metadata: unknown = { needoMessageType: "text" }
): VisibleImMessage => ({
  id,
  conversationId: 91,
  senderUserId: 52,
  type: "text" as const,
  content,
  metadata
});

const createFixture = (options: {
  messages?: ReturnType<typeof message>[];
  provider?: TranslationProvider;
  finalizationOutcome?: "committed" | "not_found" | "cache_conflict";
  providerOutput?: {
    detectedSourceLanguages: Array<string | null>;
    providerRequestId: string | null;
    providerRequestIds?: Array<string | null>;
    texts: string[];
  };
}) => {
  const provider: TranslationProvider = options.provider ?? {
    key: "deepl",
    translate: jest.fn(
      async () =>
        options.providerOutput ?? {
          detectedSourceLanguages: ["EN"],
          providerRequestId: "provider-request-1",
          texts: ["翻訳"]
        }
    )
  };
  const finalizeTranslations = jest
    .fn<
      ReturnType<ImMessageTranslationRepositoryPort["finalizeTranslations"]>,
      Parameters<ImMessageTranslationRepositoryPort["finalizeTranslations"]>
    >()
    .mockResolvedValue(options.finalizationOutcome ?? "committed");
  const repository = {
    loadVisibleMessages: jest
      .fn<
        ReturnType<ImMessageTranslationRepositoryPort["loadVisibleMessages"]>,
        Parameters<ImMessageTranslationRepositoryPort["loadVisibleMessages"]>
      >()
      .mockResolvedValue(options.messages ?? [message(1, "hello")]),
    findCachedTranslations: jest
      .fn<
        ReturnType<ImMessageTranslationRepositoryPort["findCachedTranslations"]>,
        Parameters<ImMessageTranslationRepositoryPort["findCachedTranslations"]>
      >()
      .mockResolvedValue([]),
    finalizeTranslations
  } as jest.Mocked<ImMessageTranslationRepositoryPort> & {
    finalizeTranslations: typeof finalizeTranslations;
  };
  const personalIdentityScope = {
    resolve: jest.fn(async () => ({
      identityId: 71,
      userId: 41,
      identityType: "customer",
      scopeType: "self",
      scopeId: 41
    }))
  };
  return {
    personalIdentityScope,
    provider,
    repository,
    service: new ImMessageTranslationService(repository, personalIdentityScope, provider)
  };
};

describe("ImMessageTranslationService", () => {
  it.each([
    ["Kana", "これはテストです", "ja" as const],
    ["Hangul", "안녕하세요", "ko" as const]
  ])(
    "short-circuits obvious same-language %s without a provider call",
    async (_label, content, targetLanguage) => {
      const fixture = createFixture({ messages: [message(1, content)] });

      await expect(
        fixture.service.translateVisibleMessages(auth, {
          conversationId: 91,
          messageIds: [1],
          targetLanguage
        })
      ).resolves.toEqual([{ messageId: 1, status: "same_language" }]);
      expect(fixture.provider.translate).not.toHaveBeenCalled();
      expect(fixture.repository.finalizeTranslations).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ["Han-only", "测试", "zh" as const],
    ["short Latin", "OK", "en" as const]
  ])("sends ambiguous %s content to the provider", async (_label, content, targetLanguage) => {
    const fixture = createFixture({ messages: [message(1, content)] });

    await fixture.service.translateVisibleMessages(auth, {
      conversationId: 91,
      messageIds: [1],
      targetLanguage
    });

    expect(fixture.provider.translate).toHaveBeenCalledWith({ texts: [content], targetLanguage });
  });

  it("uses the exact media caption as the source and hashes whitespace without normalization", async () => {
    const source = "  活动海报  ";
    const fixture = createFixture({
      messages: [
        message(1, "图片", {
          needoMessageType: "image",
          needoMessageExt: { caption: source, url: "/media/im/image.png" }
        })
      ]
    });

    await fixture.service.translateVisibleMessages(auth, {
      conversationId: 91,
      messageIds: [1],
      targetLanguage: "ja"
    });

    expect(fixture.provider.translate).toHaveBeenCalledWith({
      texts: [source],
      targetLanguage: "ja"
    });
    expect(fixture.repository.finalizeTranslations).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 91,
        identityId: 71,
        writes: [
          expect.objectContaining({
            messageId: 1,
            sourceContentHash: createHash("sha256").update(source, "utf8").digest("hex"),
            targetLanguage: "ja",
            providerKey: "deepl"
          })
        ]
      })
    );
  });

  it("preserves requested message order while translating duplicate text once", async () => {
    const fixture = createFixture({
      messages: [message(3, "same"), message(1, "first"), message(2, "same")],
      providerOutput: {
        detectedSourceLanguages: ["EN", "EN"],
        providerRequestId: "provider-request-2",
        providerRequestIds: ["chunk-1", "chunk-2"],
        texts: ["同じ", "最初"]
      }
    });

    const result = await fixture.service.translateVisibleMessages(auth, {
      conversationId: 91,
      messageIds: [2, 1, 3],
      targetLanguage: "ja"
    });

    expect(fixture.provider.translate).toHaveBeenCalledWith({
      texts: ["same", "first"],
      targetLanguage: "ja"
    });
    expect(result).toEqual([
      { messageId: 2, status: "translated", translatedContent: "同じ" },
      { messageId: 1, status: "translated", translatedContent: "最初" },
      { messageId: 3, status: "translated", translatedContent: "同じ" }
    ]);
    expect(fixture.repository.finalizeTranslations).toHaveBeenCalledWith(
      expect.objectContaining({
        writes: [
          expect.objectContaining({ messageId: 2, providerRequestId: "chunk-1" }),
          expect.objectContaining({ messageId: 1, providerRequestId: "chunk-2" }),
          expect.objectContaining({ messageId: 3, providerRequestId: "chunk-1" })
        ]
      })
    );
  });

  it("rejects the full batch when any requested authoritative message is unavailable", async () => {
    const fixture = createFixture({ messages: [message(1, "visible")] });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [1, 2],
        targetLanguage: "ja"
      })
    ).rejects.toMatchObject({ message: "error.im.translation_message_not_found", statusCode: 404 });
    expect(fixture.provider.translate).not.toHaveBeenCalled();
  });

  it("marks system and non-caption media messages ineligible without provider calls", async () => {
    const fixture = createFixture({
      messages: [
        { ...message(1, "system"), senderUserId: null, type: "system" as const },
        message(2, "文件", { needoMessageType: "file", needoMessageExt: { fileName: "x.pdf" } })
      ]
    });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [2, 1],
        targetLanguage: "ja"
      })
    ).resolves.toEqual([
      { messageId: 2, status: "ineligible" },
      { messageId: 1, status: "ineligible" }
    ]);
    expect(fixture.provider.translate).not.toHaveBeenCalled();
  });

  it("rejects malformed provider cardinality before writing any cache entry", async () => {
    const fixture = createFixture({
      messages: [message(1, "first"), message(2, "second")],
      providerOutput: {
        detectedSourceLanguages: ["EN"],
        providerRequestId: "malformed-request",
        texts: ["一つだけ"]
      }
    });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [1, 2],
        targetLanguage: "ja"
      })
    ).rejects.toMatchObject({
      message: "error.im.translation_provider_invalid_response",
      statusCode: 503
    });
    expect(fixture.repository.finalizeTranslations).not.toHaveBeenCalled();
  });

  it("returns cached results only for the exact message/hash/target/provider key", async () => {
    const fixture = createFixture({ messages: [message(1, "hello")] });
    fixture.repository.findCachedTranslations.mockResolvedValueOnce([
      {
        messageId: 1,
        sourceContentHash: createHash("sha256").update("hello").digest("hex"),
        sourceLanguage: "EN",
        targetLanguage: "ja",
        translatedContent: "こんにちは",
        providerKey: "deepl",
        providerRequestId: "cached-request"
      }
    ]);

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [1],
        targetLanguage: "ja"
      })
    ).resolves.toEqual([{ messageId: 1, status: "translated", translatedContent: "こんにちは" }]);
    expect(fixture.repository.findCachedTranslations).toHaveBeenCalledWith([
      expect.objectContaining({
        messageId: 1,
        targetLanguage: "ja",
        providerKey: "deepl"
      })
    ]);
    expect(fixture.provider.translate).not.toHaveBeenCalled();
    expect(fixture.repository.finalizeTranslations).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredCacheKeys: [expect.objectContaining({ messageId: 1 })],
        writes: []
      })
    );
  });

  it.each([
    "provider-period recall",
    "delete-for-me tombstone",
    "clear-history cutoff",
    "participant removal",
    "exact source change",
    "provider-period identity deactivation",
    "provider-period identity soft deletion",
    "provider-period identity reassignment to another user",
    "provider-period user deactivation",
    "provider-period user soft deletion"
  ])("rejects the whole batch when final authoritative validation detects %s", async () => {
    const fixture = createFixture({ finalizationOutcome: "not_found" });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [1],
        targetLanguage: "ja"
      })
    ).rejects.toMatchObject({
      message: "error.im.translation_message_not_found",
      statusCode: 404
    });
    expect(fixture.provider.translate).toHaveBeenCalledTimes(1);
  });

  it("returns a typed conflict without writes for a soft-deleted cache reservation", async () => {
    const fixture = createFixture({ finalizationOutcome: "cache_conflict" });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: [1],
        targetLanguage: "ja"
      })
    ).rejects.toMatchObject({
      message: "error.im.translation_cache_conflict",
      statusCode: 409
    });
  });

  it("writes nothing when a later DeepL chunk fails", async () => {
    let call = 0;
    const fetchImplementation = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        call += 1;
        if (call === 2) {
          return new Response(JSON.stringify({ message: "unavailable" }), { status: 503 });
        }
        const texts = new URLSearchParams(String(init?.body)).getAll("text");
        return new Response(
          JSON.stringify({
            translations: texts.map((text) => ({
              detected_source_language: "EN",
              text: `translated-${text.slice(-2)}`
            }))
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const provider = new DeepLTranslationProvider({
      apiBaseUrl: "https://api-free.deepl.com",
      apiKey: "private-test-key:fx",
      fetch: fetchImplementation,
      maxRetries: 0,
      timeoutMs: 500
    });
    const messages = Array.from({ length: 33 }, (_, index) =>
      message(index + 1, `${"a".repeat(3_997)}-${String(index).padStart(2, "0")}`)
    );
    const fixture = createFixture({ messages, provider });

    await expect(
      fixture.service.translateVisibleMessages(auth, {
        conversationId: 91,
        messageIds: messages.map(({ id }) => id),
        targetLanguage: "ja"
      })
    ).rejects.toMatchObject({ message: "error.im.translation_provider_unavailable" });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fixture.repository.finalizeTranslations).not.toHaveBeenCalled();
  });
});
