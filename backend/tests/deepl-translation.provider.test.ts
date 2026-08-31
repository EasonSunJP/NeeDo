import { DeepLTranslationProvider } from "../src/services/deepl-translation.provider";
import { AppError } from "../src/utils/app-error";

const response = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });

describe("DeepLTranslationProvider", () => {
  it.each([
    ["zh", "ZH-HANS"],
    ["zh-Hant", "ZH-HANT"],
    ["ja", "JA"],
    ["en", "EN"],
    ["ko", "KO"]
  ] as const)(
    "maps %s to DeepL %s and uses the Free HTTP contract",
    async (targetLanguage, expected) => {
      const fetchImplementation = jest.fn(
        async (_url: string | URL | Request, init?: RequestInit) => {
          expect(init?.method).toBe("POST");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "DeepL-Auth-Key private-test-key:fx"
          );
          expect(new Headers(init?.headers).get("content-type")).toBe(
            "application/x-www-form-urlencoded"
          );
          const body = new URLSearchParams(String(init?.body));
          expect(body.getAll("text")).toEqual(["first", "second"]);
          expect(body.get("target_lang")).toBe(expected);
          expect(body.has("auth_key")).toBe(false);
          return response(
            200,
            {
              translations: [
                { detected_source_language: "EN", text: "一" },
                { detected_source_language: "EN", text: "二" }
              ]
            },
            { "x-request-id": "deepl-request-1" }
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

      await expect(
        provider.translate({ texts: ["first", "second"], targetLanguage })
      ).resolves.toEqual({
        detectedSourceLanguages: ["EN", "EN"],
        providerRequestId: "deepl-request-1",
        texts: ["一", "二"]
      });
      expect(fetchImplementation).toHaveBeenCalledWith(
        "https://api-free.deepl.com/v2/translate",
        expect.any(Object)
      );
    }
  );

  it("aborts a timed-out request and never exposes the API key", async () => {
    const fetchImplementation = jest.fn(
      async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("private-test-key:fx", "AbortError"))
          );
        })
    );
    const provider = new DeepLTranslationProvider({
      apiBaseUrl: "https://api-free.deepl.com",
      apiKey: "private-test-key:fx",
      fetch: fetchImplementation,
      maxRetries: 0,
      timeoutMs: 5
    });

    const error = await provider
      .translate({ texts: ["hello"], targetLanguage: "ja" })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ message: "error.im.translation_timeout", statusCode: 503 });
    expect(String(error)).not.toContain("private-test-key");
    expect(JSON.stringify(error)).not.toContain("private-test-key");
  });

  it("retries 429 with bounded exponential jitter and returns a typed rate-limit error", async () => {
    const fetchImplementation = jest.fn(async () =>
      response(429, { message: "key private-test-key:fx" })
    );
    const delays: number[] = [];
    const provider = new DeepLTranslationProvider({
      apiBaseUrl: "https://api-free.deepl.com",
      apiKey: "private-test-key:fx",
      fetch: fetchImplementation,
      maxRetries: 2,
      random: () => 0.5,
      sleep: async (delayMs: number) => {
        delays.push(delayMs);
      },
      timeoutMs: 500
    });

    const error = await provider
      .translate({ texts: ["hello"], targetLanguage: "ja" })
      .catch((caught: unknown) => caught);

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[1]).toBeGreaterThan(delays[0] ?? 0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(5_000);
    expect(error).toMatchObject({ message: "error.im.translation_rate_limited", statusCode: 429 });
    expect(String(error)).not.toContain("private-test-key");
  });

  it("maps DeepL quota exhaustion to a typed 456 error without retrying", async () => {
    const fetchImplementation = jest.fn(async () => response(456, { message: "Quota exceeded" }));
    const provider = new DeepLTranslationProvider({
      apiBaseUrl: "https://api-free.deepl.com",
      apiKey: "private-test-key:fx",
      fetch: fetchImplementation,
      maxRetries: 2,
      timeoutMs: 500
    });

    await expect(
      provider.translate({ texts: ["hello"], targetLanguage: "ja" })
    ).rejects.toMatchObject({
      message: "error.im.translation_quota_exceeded",
      statusCode: 456
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("maps a terminal DeepL 5xx response to provider unavailable", async () => {
    const fetchImplementation = jest.fn(async () => response(503, { message: "unavailable" }));
    const provider = new DeepLTranslationProvider({
      apiBaseUrl: "https://api-free.deepl.com",
      apiKey: "private-test-key:fx",
      fetch: fetchImplementation,
      maxRetries: 1,
      sleep: async () => undefined,
      timeoutMs: 500
    });

    await expect(
      provider.translate({ texts: ["hello"], targetLanguage: "ja" })
    ).rejects.toMatchObject({
      message: "error.im.translation_provider_unavailable",
      statusCode: 503
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
