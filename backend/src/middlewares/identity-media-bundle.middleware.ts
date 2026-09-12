import type { RequestHandler } from "express";
import multer from "multer";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
export const MAX_IDENTITY_PREVIEW_BYTES = 2 * 1024 * 1024;
const originalMimeTypes = new Set(["image/jpeg", "image/png"]);
const previewMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ORIGINAL_BYTES, files: 2 },
  fileFilter: (_request, file, callback) => {
    const safeName = file.originalname.length > 0 &&
      file.originalname.length <= 255 &&
      !/[\\/\0]/u.test(file.originalname);
    if (!safeName) {
      callback(new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.media_invalid",
        statusCode: 400
      }));
      return;
    }
    const acceptedMimeTypes = file.fieldname === "original" ? originalMimeTypes : previewMimeTypes;
    if (!acceptedMimeTypes.has(file.mimetype)) {
      callback(new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identity_application.media_type_unsupported",
        statusCode: 415
      }));
      return;
    }
    callback(null, true);
  }
}).fields([
  { name: "original", maxCount: 1 },
  { name: "preview", maxCount: 1 }
]);

export const identityMediaBundleMiddleware: RequestHandler = (request, response, next) => {
  upload(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof AppError) {
      next(error);
      return;
    }
    const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    next(new AppError({
      code: ERROR_CODES.VALIDATION,
      message: tooLarge
        ? "error.identity_application.media_too_large"
        : "error.identity_application.media_invalid",
      statusCode: tooLarge ? 413 : 400,
      cause: error
    }));
  });
};
