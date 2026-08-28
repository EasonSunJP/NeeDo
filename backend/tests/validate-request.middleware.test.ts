import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { validateRequest } from "../src/middlewares/validate-request.middleware";
import { AppError } from "../src/utils/app-error";
import {
  contentPublicationValidationErrorMessage,
  scheduleBodySchema,
  translationBodySchema,
  userHomeCarouselDraftCreateBodySchema
} from "../src/validators/content-publication.validator";

const idempotencyKey = "c44f6308-7265-41b6-a938-b6615746b996";

const validTranslation = {
  locale: "ja",
  badge: null,
  title: "お知らせ",
  caption: null,
  ctaLabel: null,
  imageAltText: "お知らせ画像"
};

const validDraft = {
  idempotencyKey,
  sourceLocale: "ja",
  slides: [
    {
      mediaAssetPublicId: "a".repeat(64),
      sortOrder: 0,
      isEnabled: true,
      visibleFrom: null,
      visibleUntil: null,
      target: { type: "shop", shopId: 7 },
      translations: [validTranslation]
    }
  ]
};

const validateBody = (
  schema: z.ZodTypeAny,
  body: unknown,
  useContentPublicationErrors = true
): AppError | undefined => {
  const request = { body } as Request;
  let receivedError: unknown;
  const next = ((error?: unknown) => {
    receivedError = error;
  }) as NextFunction;

  validateRequest({
    body: schema,
    validationErrorMessage: useContentPublicationErrors
      ? contentPublicationValidationErrorMessage
      : undefined
  })(request, {} as Response, next);

  return receivedError instanceof AppError ? receivedError : undefined;
};

describe("validateRequest content-publication error behavior", () => {
  it("surfaces the stable invalid-locale key", () => {
    expect(
      validateBody(translationBodySchema, { ...validTranslation, locale: "fr" })?.message
    ).toBe("error.content.locale_invalid");
  });

  it("surfaces the stable invalid-media key", () => {
    expect(
      validateBody(userHomeCarouselDraftCreateBodySchema, {
        ...validDraft,
        slides: [{ ...validDraft.slides[0], mediaAssetPublicId: "not-a-checksum" }]
      })?.message
    ).toBe("error.content.media_invalid");
  });

  it.each([
    { type: "affiliate_announcement", announcementPublicId: idempotencyKey },
    { type: "shop", shopId: 7, serviceId: 9 },
    { type: "unknown", shopId: 7 }
  ])("surfaces the stable invalid-target key for %#", (target) => {
    expect(
      validateBody(userHomeCarouselDraftCreateBodySchema, {
        ...validDraft,
        slides: [{ ...validDraft.slides[0], target }]
      })?.message
    ).toBe("error.content.target_invalid");
  });

  it("surfaces the stable schedule key for invalid publish and visibility times", () => {
    expect(
      validateBody(scheduleBodySchema, {
        idempotencyKey,
        expectedLockVersion: 1,
        publishAt: "2999-01-01T09:00:00+09:00"
      })?.message
    ).toBe("error.content.schedule_conflict");
    expect(
      validateBody(userHomeCarouselDraftCreateBodySchema, {
        ...validDraft,
        slides: [
          {
            ...validDraft.slides[0],
            visibleFrom: "2030-01-02T00:00:00.000Z",
            visibleUntil: "2030-01-01T00:00:00.000Z"
          }
        ]
      })?.message
    ).toBe("error.content.schedule_conflict");
  });

  it("preserves generic validation fallback for unrelated schemas", () => {
    expect(
      validateBody(z.object({ id: z.number().int().positive() }), { id: 0 }, false)?.message
    ).toBe("error.validation");
  });
});
