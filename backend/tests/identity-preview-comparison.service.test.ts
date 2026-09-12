import sharp from "sharp";
import { IdentityPreviewComparisonService } from "../src/services/identity-preview-comparison.service";

describe("IdentityPreviewComparisonService", () => {
  const comparison = new IdentityPreviewComparisonService();

  it("accepts a client preview derived from the original", async () => {
    const original = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#38bdf8" }
    }).jpeg({ quality: 100 }).toBuffer();
    const preview = await sharp(original).resize({ width: 700 }).jpeg({ quality: 94 }).toBuffer();

    await expect(comparison.assertRelated(original, preview)).resolves.toBeUndefined();
  });

  it("rejects an unrelated preview", async () => {
    const original = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#38bdf8" }
    }).png().toBuffer();
    const unrelated = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#f43f5e" }
    }).jpeg().toBuffer();

    await expect(comparison.assertRelated(original, unrelated)).rejects.toMatchObject({
      message: "error.identity_application.preview_mismatch",
      statusCode: 400
    });
  });
});
