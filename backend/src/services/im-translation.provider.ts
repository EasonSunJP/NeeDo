import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export const imTranslationTargetLanguages = ["zh", "zh-Hant", "ja", "en", "ko"] as const;

export type ImTranslationTargetLanguage = (typeof imTranslationTargetLanguages)[number];

export interface TranslationProviderRequest {
  texts: string[];
  targetLanguage: ImTranslationTargetLanguage;
}

export interface TranslationProviderResult {
  texts: string[];
  detectedSourceLanguages: Array<string | null>;
  providerRequestId: string | null;
  providerRequestIds?: Array<string | null>;
}

export type TranslationProviderInput = TranslationProviderRequest;
export type TranslationProviderOutput = TranslationProviderResult;

export interface TranslationProvider {
  readonly key: string;
  translate(request: TranslationProviderRequest): Promise<TranslationProviderResult>;
}

export class DisabledTranslationProvider implements TranslationProvider {
  public readonly key = "disabled";

  public async translate(): Promise<never> {
    throw new AppError({
      code: ERROR_CODES.IM_TRANSLATION_PROVIDER_UNAVAILABLE,
      message: "error.im.translation_provider_unavailable",
      statusCode: 503
    });
  }
}
