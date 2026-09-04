import { orderReviewCreateBodySchema } from "../src/validators/booking.validator";

const idempotencyKey = "review-command-000001";

const validInput = {
  targetType: "technician" as const,
  rating: 5,
  tags: [" 服务精神 ", "元气"],
  comment: " 很满意 ",
  idempotencyKey
};

describe("order review validator", () => {
  it("normalizes the strict command and accepts integer rating boundaries", () => {
    expect(orderReviewCreateBodySchema.parse(validInput)).toEqual({
      ...validInput,
      tags: ["服务max", "元气max"],
      comment: "很满意"
    });
    expect(orderReviewCreateBodySchema.parse({ ...validInput, rating: 1 }).rating).toBe(1);
    expect(() => orderReviewCreateBodySchema.parse({ ...validInput, internalUserId: 8 })).toThrow();
  });

  it.each([0, 0.5, 1.5, 5.5, 6])("rejects non-integer or out-of-range rating %s", (rating) => {
    expect(() => orderReviewCreateBodySchema.parse({ ...validInput, rating })).toThrow();
  });

  it("normalizes NFKC tags and rejects excessive, invisible, oversized, and folded duplicates", () => {
    expect(orderReviewCreateBodySchema.parse({ ...validInput, tags: ["ＡＢＣ"] }).tags).toEqual([
      "ABC"
    ]);
    expect(() =>
      orderReviewCreateBodySchema.parse({
        ...validInput,
        targetType: "customer",
        tags: Array.from({ length: 9 }, (_, i) => `标签${i}`)
      })
    ).toThrow();
    expect(() => orderReviewCreateBodySchema.parse({ ...validInput, tags: ["\u200B"] })).toThrow();
    expect(() =>
      orderReviewCreateBodySchema.parse({ ...validInput, tags: ["好".repeat(41)] })
    ).toThrow();
    expect(() =>
      orderReviewCreateBodySchema.parse({ ...validInput, tags: ["Service", "ｓｅｒｖｉｃｅ"] })
    ).toThrow();
  });

  it.each([
    [["Straße", "STRASSE"], "multi-character sharp-s expansion"],
    [["Σ", "ς"], "final sigma folding"],
    [["ẞ", "ss"], "capital sharp-s expansion"]
  ])("rejects Unicode full-fold duplicates for %s (%s)", (tags) => {
    expect(() =>
      orderReviewCreateBodySchema.parse({ ...validInput, targetType: "customer", tags })
    ).toThrow();
  });

  it("keeps dotless i distinct from latin i under Unicode default case folding", () => {
    expect(
      orderReviewCreateBodySchema.parse({ ...validInput, targetType: "customer", tags: ["ı", "i"] })
        .tags
    ).toEqual(["ı", "i"]);
  });

  it("canonicalizes four fixed technician labels and permits one custom label", () => {
    expect(
      orderReviewCreateBodySchema.parse({
        ...validInput,
        tags: ["魅力值", "服务精神", "情绪价值", "元气", "手法细致"]
      }).tags
    ).toEqual(["魅力max", "服务max", "情绪max", "元气max", "手法细致"]);
  });

  it("rejects a second custom technician label without changing customer review rules", () => {
    expect(() =>
      orderReviewCreateBodySchema.parse({
        ...validInput,
        tags: ["魅力max", "手法细致", "沟通耐心"]
      })
    ).toThrow("technician review accepts at most one custom tag");

    expect(
      orderReviewCreateBodySchema.parse({
        ...validInput,
        targetType: "customer",
        tags: ["礼貌友好", "准时到达"]
      }).tags
    ).toEqual(["礼貌友好", "准时到达"]);
  });

  it("rejects aliases that canonicalize to the same fixed technician label", () => {
    expect(() =>
      orderReviewCreateBodySchema.parse({
        ...validInput,
        tags: ["魅力值", "魅力max"]
      })
    ).toThrow("review tags must be unique after Unicode normalization and case folding");
  });

  it("normalizes blank comments to null and rejects invisible or oversized comments", () => {
    expect(orderReviewCreateBodySchema.parse({ ...validInput, comment: "   " }).comment).toBeNull();
    expect(orderReviewCreateBodySchema.parse({ ...validInput, comment: null }).comment).toBeNull();
    expect(() => orderReviewCreateBodySchema.parse({ ...validInput, comment: "\u200B" })).toThrow();
    expect(() =>
      orderReviewCreateBodySchema.parse({ ...validInput, comment: "好".repeat(1001) })
    ).toThrow();
  });

  it("uses the existing bounded visible idempotency-key contract", () => {
    expect(
      orderReviewCreateBodySchema.parse({ ...validInput, idempotencyKey: "a".repeat(16) })
        .idempotencyKey
    ).toBe("a".repeat(16));
    expect(
      orderReviewCreateBodySchema.parse({ ...validInput, idempotencyKey: "b".repeat(160) })
        .idempotencyKey
    ).toBe("b".repeat(160));
    for (const key of ["a".repeat(15), "b".repeat(161), "\u200B".repeat(16)]) {
      expect(() =>
        orderReviewCreateBodySchema.parse({ ...validInput, idempotencyKey: key })
      ).toThrow();
    }
  });
});
