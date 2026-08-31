import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type {
  ImTranslationTargetLanguage,
  TranslationProvider,
  TranslationProviderRequest,
  TranslationProviderResult
} from "./im-translation.provider";

const deeplTargetLanguages: Record<ImTranslationTargetLanguage, string> = {
  zh: "ZH-HANS",
  "zh-Hant": "ZH-HANT",
  ja: "JA",
  en: "EN",
  ko: "KO"
};

interface DeepLTranslationProviderOptions {
  apiBaseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

interface DeepLTranslationResponse {
  translations?: Array<{ detected_source_language?: unknown; text?: unknown }>;
}

const sleep = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export class DeepLTranslationProvider implements TranslationProvider {
  public readonly key = "deepl";

  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleepImplementation: (delayMs: number) => Promise<void>;
  private readonly random: () => number;

  public constructor(options: DeepLTranslationProviderOptions) {
    this.endpoint = `${options.apiBaseUrl.replace(/\/$/, "")}/v2/translate`;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.fetchImplementation = options.fetch ?? fetch;
    this.sleepImplementation = options.sleep ?? sleep;
    this.random = options.random ?? Math.random;
  }

  public async translate(request: TranslationProviderRequest): Promise<TranslationProviderResult> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const response = await this.performRequest(request);

      if (response.ok) {
        return this.parseResponse(response);
      }

      if (response.status === 456) {
        throw new AppError({
          code: ERROR_CODES.IM_TRANSLATION_QUOTA_EXCEEDED,
          message: "error.im.translation_quota_exceeded",
          statusCode: 456
        });
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleepImplementation(this.retryDelayMs(attempt));
        continue;
      }

      if (response.status === 429) {
        throw new AppError({
          code: ERROR_CODES.IM_TRANSLATION_RATE_LIMITED,
          message: "error.im.translation_rate_limited",
          statusCode: 429
        });
      }

      throw this.providerUnavailable();
    }

    throw this.providerUnavailable();
  }

  private async performRequest(request: TranslationProviderRequest): Promise<Response> {
    const body = new URLSearchParams();
    for (const text of request.texts) {
      body.append("text", text);
    }
    body.set("target_lang", deeplTargetLanguages[request.targetLanguage]);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body,
        signal: controller.signal
      });
    } catch (error) {
      if (
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        throw new AppError({
          code: ERROR_CODES.IM_TRANSLATION_TIMEOUT,
          message: "error.im.translation_timeout",
          statusCode: 503
        });
      }
      throw this.providerUnavailable();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async parseResponse(response: Response): Promise<TranslationProviderResult> {
    let payload: DeepLTranslationResponse;
    try {
      payload = (await response.json()) as DeepLTranslationResponse;
    } catch {
      throw this.invalidResponse();
    }

    if (!Array.isArray(payload.translations)) {
      throw this.invalidResponse();
    }

    const texts: string[] = [];
    const detectedSourceLanguages: Array<string | null> = [];
    for (const translation of payload.translations) {
      if (typeof translation.text !== "string") {
        throw this.invalidResponse();
      }
      texts.push(translation.text);
      detectedSourceLanguages.push(
        typeof translation.detected_source_language === "string"
          ? translation.detected_source_language
          : null
      );
    }

    return {
      texts,
      detectedSourceLanguages,
      providerRequestId:
        response.headers.get("x-request-id") ?? response.headers.get("deepl-request-id")
    };
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(5_000, 100 * 2 ** attempt + Math.floor(this.random() * 100));
  }

  private providerUnavailable(): AppError {
    return new AppError({
      code: ERROR_CODES.IM_TRANSLATION_PROVIDER_UNAVAILABLE,
      message: "error.im.translation_provider_unavailable",
      statusCode: 503
    });
  }

  private invalidResponse(): AppError {
    return new AppError({
      code: ERROR_CODES.IM_TRANSLATION_PROVIDER_UNAVAILABLE,
      message: "error.im.translation_provider_invalid_response",
      statusCode: 503
    });
  }
}
