import sharp from "sharp";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const REFERENCE_EDGE = 256;
const MIN_SSIM = 0.98;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

interface ReferenceImage {
  data: Buffer;
  width: number;
  height: number;
}

export class IdentityPreviewComparisonService {
  public async assertRelated(original: Buffer, preview: Buffer): Promise<void> {
    try {
      const [source, candidate] = await Promise.all([
        this.reference(original),
        this.reference(preview)
      ]);
      if (
        source.width !== candidate.width ||
        source.height !== candidate.height ||
        this.ssim(source.data, candidate.data) < MIN_SSIM
      ) {
        throw this.mismatch();
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw this.mismatch(error);
    }
  }

  private async reference(bytes: Buffer): Promise<ReferenceImage> {
    const { data, info } = await sharp(bytes, {
      animated: false,
      failOn: "warning",
      limitInputPixels: 25_000_000,
      sequentialRead: true
    })
      .rotate()
      .resize({ width: REFERENCE_EDGE, height: REFERENCE_EDGE, fit: "inside" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  }

  private ssim(first: Buffer, second: Buffer): number {
    if (first.length !== second.length || first.length === 0) {
      return 0;
    }
    const pixels = first.length / 3;
    let meanA = 0;
    let meanB = 0;
    for (let index = 0; index < first.length; index += 3) {
      meanA += 0.2126 * first[index]! + 0.7152 * first[index + 1]! + 0.0722 * first[index + 2]!;
      meanB += 0.2126 * second[index]! + 0.7152 * second[index + 1]! + 0.0722 * second[index + 2]!;
    }
    meanA /= pixels;
    meanB /= pixels;
    let varianceA = 0;
    let varianceB = 0;
    let covariance = 0;
    for (let index = 0; index < first.length; index += 3) {
      const luminanceA = 0.2126 * first[index]! + 0.7152 * first[index + 1]! + 0.0722 * first[index + 2]!;
      const luminanceB = 0.2126 * second[index]! + 0.7152 * second[index + 1]! + 0.0722 * second[index + 2]!;
      varianceA += (luminanceA - meanA) ** 2;
      varianceB += (luminanceB - meanB) ** 2;
      covariance += (luminanceA - meanA) * (luminanceB - meanB);
    }
    const denominator = Math.max(1, pixels - 1);
    varianceA /= denominator;
    varianceB /= denominator;
    covariance /= denominator;
    return ((2 * meanA * meanB + C1) * (2 * covariance + C2)) /
      ((meanA ** 2 + meanB ** 2 + C1) * (varianceA + varianceB + C2));
  }

  private mismatch(cause?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.identity_application.preview_mismatch",
      statusCode: 400,
      cause
    });
  }
}
