import { logger } from "../src/config/logger";
import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  ContentMediaLockedRepositoryPort,
  ContentMediaRepositoryPort
} from "../src/services/content-media.service";
import type {
  ContentMediaStoragePort,
  PreparedContentMedia,
  StoredContentMedia
} from "../src/services/content-media.storage";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import {
  type PricingModeRepositoryPort,
  type TechnicianServiceCoverTarget,
  type TechnicianServicePayload
} from "../src/services/pricing-mode.service";
import { TechnicianServiceCoverService } from "../src/services/technician-service-cover.service";
import { AppError } from "../src/utils/app-error";
import {
  createValidExcessivePixelPng,
  validJpeg,
  validTwoFrameApng
} from "./fixtures/content-images";

const jpeg = validJpeg;
const now = new Date("2026-09-04T00:00:00.000Z");
const checksumSha256 = "a".repeat(64);
const fileKey = "cover.jpg";
const url = `/media/content/${fileKey}`;
const actor = {
  userId: 8,
  email: "technician@example.com",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 18,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 3,
  roles: ["technician"],
  permissions: ["technician:services:write"]
};
const context = { ip: "127.0.0.1", userAgent: "jest" };

const servicePayload = (coverImageUrl: string | null = url): TechnicianServicePayload => ({
  id: 11,
  publicId: "00000000-0000-4000-8000-000000000011",
  shopId: 1,
  technicianId: 3,
  sourceShopServiceId: null,
  name: "深层护理 60 分钟",
  description: "肩颈放松",
  categoryId: 2,
  priceAmount: 8_800,
  currency: "JPY",
  durationMinutes: 60,
  usageCount: 7,
  taxIncluded: true,
  coverImageUrl,
  images: [],
  tags: ["推荐"],
  shop: { publicId: "shop0000000001", name: "LifeDance", address: "东京都港区" },
  isActive: true,
  isBookable: true,
  isRecommended: false,
  sortOrder: 0,
  reviewStatus: "approved",
  rejectionReason: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString()
});

interface RepositoryOptions {
  coverTarget?: TechnicianServiceCoverTarget | null;
  currentChecksum?: string | null;
}

const createRepository = (
  options: RepositoryOptions = {}
): jest.Mocked<PricingModeRepositoryPort> => {
  const currentChecksum = options.currentChecksum ?? null;
  const coverTarget =
    options.coverTarget === undefined
      ? {
          service: servicePayload(currentChecksum ? url : null),
          activeMediaAssetId: currentChecksum ? 101 : null,
          checksumSha256: currentChecksum,
          mimeType: currentChecksum ? "image/jpeg" : null
        }
      : options.coverTarget;

  return {
    findShopPricingMode: jest.fn(),
    updateShopPricingMode: jest.fn(),
    findTechnicianShopScope: jest.fn(async (_technicianId: number, shopId: number) => {
      void _technicianId;
      return { technicianId: 3, shopId };
    }),
    listTechnicianServices: jest.fn(),
    listTechnicianServicesByProfile: jest.fn(),
    findPrimaryTechnicianService: jest.fn(),
    reorderTechnicianServices: jest.fn(),
    createTechnicianService: jest.fn(),
    updateTechnicianService: jest.fn(),
    deleteTechnicianService: jest.fn(),
    listBookingNavigationShopServices: jest.fn(),
    listBookingNavigationTechnicians: jest.fn(),
    listPublicTechnicianServices: jest.fn(),
    findTechnicianServiceCoverTarget: jest.fn(
      async (
        _input: Parameters<PricingModeRepositoryPort["findTechnicianServiceCoverTarget"]>[0]
      ) => {
        void _input;
        return coverTarget;
      }
    ),
    replaceTechnicianServiceCover: jest.fn(
      async (_input: Parameters<PricingModeRepositoryPort["replaceTechnicianServiceCover"]>[0]) => {
        void _input;
        return servicePayload();
      }
    ),
    removeTechnicianServiceCover: jest.fn(
      async (_input: Parameters<PricingModeRepositoryPort["removeTechnicianServiceCover"]>[0]) => {
        void _input;
        return servicePayload(null);
      }
    ),
    hasActiveMediaUrl: jest.fn(async (_url: string) => {
      void _url;
      return false;
    })
  };
};

interface StorageOptions {
  checksumSha256?: string;
  created?: boolean;
}

const createStorage = (options: StorageOptions = {}): jest.Mocked<ContentMediaStoragePort> => {
  const prepared: PreparedContentMedia = {
    checksumSha256: options.checksumSha256 ?? checksumSha256,
    fileKey,
    mimeType: "image/jpeg"
  };
  const stored: StoredContentMedia = {
    ...prepared,
    created: options.created ?? true
  };

  return {
    prepare: jest.fn(async (_input: Parameters<ContentMediaStoragePort["prepare"]>[0]) => {
      void _input;
      return prepared;
    }),
    save: jest.fn(async (_input: Parameters<ContentMediaStoragePort["save"]>[0]) => {
      void _input;
      return stored;
    }),
    read: jest.fn(),
    delete: jest.fn(async (_fileKey: string) => {
      void _fileKey;
    })
  };
};

const createChecksumLock = (): Pick<ContentMediaRepositoryPort, "withChecksumLock"> => ({
  async withChecksumLock<T>(
    _checksumSha256: string,
    operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
  ): Promise<T> {
    return operation({ create: jest.fn() });
  }
});

describe("TechnicianServiceCoverService", () => {
  it("uploads one owned service cover", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());
    const strictStorageInput = {
      bytes: jpeg,
      mimeType: "image/jpeg" as const,
      validationProfile: "decoded-single-frame" as const
    };

    await expect(
      service.uploadCover(actor, context, 1, 11, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        now
      })
    ).resolves.toMatchObject({ id: 11, coverImageUrl: "/media/content/cover.jpg" });
    expect(repository.replaceTechnicianServiceCover).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: 1,
        technicianId: 3,
        serviceId: 11,
        ownerUserId: 8,
        ownerIdentityId: 18,
        fileSize: jpeg.length,
        action: "technician.service.cover.updated"
      })
    );
    expect(storage.prepare).toHaveBeenCalledWith(strictStorageInput);
    expect(storage.save).toHaveBeenCalledWith(strictStorageInput);
  });

  it("does not mutate persistence when injected storage rejects strict validation during save", async () => {
    const repository = createRepository();
    const storage = createStorage();
    storage.save.mockImplementationOnce(async (input) => {
      if (input.validationProfile === "decoded-single-frame") {
        throw new AppError({
          code: ERROR_CODES.VALIDATION,
          message: "error.content.media_invalid",
          statusCode: 400
        });
      }
      return {
        checksumSha256,
        fileKey,
        mimeType: "image/jpeg",
        created: true
      };
    });
    const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());

    await expect(
      service.uploadCover(actor, context, 1, 11, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        now
      })
    ).rejects.toMatchObject({
      message: "error.technician_service.cover_invalid",
      statusCode: 400
    });
    expect(storage.save).toHaveBeenCalledWith({
      bytes: jpeg,
      mimeType: "image/jpeg",
      validationProfile: "decoded-single-frame"
    });
    expect(repository.replaceTechnicianServiceCover).not.toHaveBeenCalled();
    expect(repository.hasActiveMediaUrl).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("rejects APNG and valid images above the decoded-pixel limit before persistence", async () => {
    const repository = createRepository();
    const storage = new ContentMediaFileStorage("/unused");
    const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());
    const validLargePng = await createValidExcessivePixelPng();

    await expect(
      service.uploadCover(actor, context, 1, 11, {
        bytes: validTwoFrameApng,
        mimeType: "image/png",
        now
      })
    ).rejects.toMatchObject({ message: "error.technician_service.cover_invalid" });
    await expect(
      service.uploadCover(actor, context, 1, 11, {
        bytes: validLargePng,
        mimeType: "image/png",
        now
      })
    ).rejects.toMatchObject({ message: "error.technician_service.cover_invalid" });
    expect(repository.replaceTechnicianServiceCover).not.toHaveBeenCalled();
  });

  it("rejects an invalid active identity before resolving technician scope", async () => {
    const repository = createRepository();
    const storage = createStorage();
    const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());

    await expect(
      service.uploadCover({ ...actor, currentIdentityType: "customer" }, context, 1, 11, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        now
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403,
      message: "error.identity.forbidden"
    });
    expect(repository.findTechnicianShopScope).not.toHaveBeenCalled();
    expect(storage.prepare).not.toHaveBeenCalled();
  });

  it("rejects a shop outside the technician affiliation before resolving the service", async () => {
    const repository = createRepository();
    repository.findTechnicianShopScope.mockResolvedValueOnce({ technicianId: 3, shopId: 2 });
    const storage = createStorage();
    const service = new TechnicianServiceCoverService(repository, storage, createChecksumLock());

    await expect(
      service.uploadCover(actor, context, 1, 11, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        now
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403,
      message: "error.identity.forbidden"
    });
    expect(repository.findTechnicianServiceCoverTarget).not.toHaveBeenCalled();
    expect(storage.prepare).not.toHaveBeenCalled();
  });

  it("does not store bytes for an unowned service", async () => {
    const repository = createRepository({ coverTarget: null });
    const storage = createStorage();

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        99,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "error.technician_service.not_found"
    });
    expect(storage.prepare).not.toHaveBeenCalled();
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("keeps an exact cover retry idempotent", async () => {
    const repository = createRepository({ currentChecksum: checksumSha256 });
    const storage = createStorage({ checksumSha256 });

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).resolves.toMatchObject({ id: 11, coverImageUrl: url });
    expect(storage.save).not.toHaveBeenCalled();
    expect(repository.replaceTechnicianServiceCover).not.toHaveBeenCalled();
  });

  it("rechecks an exact retry after acquiring the checksum lock", async () => {
    const repository = createRepository();
    repository.findTechnicianServiceCoverTarget
      .mockResolvedValueOnce({
        service: servicePayload(null),
        activeMediaAssetId: null,
        checksumSha256: null,
        mimeType: null
      })
      .mockResolvedValueOnce({
        service: servicePayload(url),
        activeMediaAssetId: 101,
        checksumSha256,
        mimeType: "image/jpeg"
      });
    const storage = createStorage({ checksumSha256 });

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).resolves.toMatchObject({ id: 11, coverImageUrl: url });
    expect(repository.findTechnicianServiceCoverTarget).toHaveBeenCalledTimes(2);
    expect(storage.save).not.toHaveBeenCalled();
    expect(repository.replaceTechnicianServiceCover).not.toHaveBeenCalled();
  });

  it.each([
    ["error.content.media_invalid", 400, "error.technician_service.cover_invalid"],
    ["error.content.media_too_large", 413, "error.technician_service.cover_too_large"]
  ])("maps %s storage validation", async (storageMessage, statusCode, expectedMessage) => {
    const repository = createRepository();
    const storage = createStorage();
    storage.prepare.mockImplementationOnce(() => {
      throw new AppError({ code: ERROR_CODES.VALIDATION, message: storageMessage, statusCode });
    });

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      statusCode,
      message: expectedMessage
    });
  });

  it("removes an existing cover", async () => {
    const repository = createRepository({ currentChecksum: checksumSha256 });
    const service = new TechnicianServiceCoverService(
      repository,
      createStorage(),
      createChecksumLock()
    );

    await expect(service.removeCover(actor, context, 1, 11, now)).resolves.toMatchObject({
      id: 11,
      coverImageUrl: null
    });
    expect(repository.removeTechnicianServiceCover).toHaveBeenCalledWith({
      shopId: 1,
      technicianId: 3,
      serviceId: 11,
      ownerUserId: 8,
      ownerIdentityId: 18,
      now,
      action: "technician.service.cover.removed",
      context
    });
  });

  it("treats removal without an active cover as idempotent", async () => {
    const repository = createRepository();
    const service = new TechnicianServiceCoverService(
      repository,
      createStorage(),
      createChecksumLock()
    );

    await expect(service.removeCover(actor, context, 1, 11, now)).resolves.toMatchObject({
      id: 11,
      coverImageUrl: null
    });
    expect(repository.removeTechnicianServiceCover).not.toHaveBeenCalled();
  });

  it("deletes only a newly-created unreferenced blob after persistence failure", async () => {
    const repository = createRepository();
    repository.replaceTechnicianServiceCover.mockRejectedValueOnce(new Error("database failed"));
    repository.hasActiveMediaUrl.mockResolvedValueOnce(false);
    const storage = createStorage({ created: true });

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).rejects.toThrow("database failed");
    expect(storage.delete).toHaveBeenCalledWith(expect.stringMatching(/\.jpg$/u));
  });

  it("does not delete a newly-created blob that another active media row references", async () => {
    const repository = createRepository();
    repository.replaceTechnicianServiceCover.mockRejectedValueOnce(new Error("database failed"));
    repository.hasActiveMediaUrl.mockResolvedValueOnce(true);
    const storage = createStorage({ created: true });

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).rejects.toThrow("database failed");
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("preserves the database error when compensation delete logging is required", async () => {
    const persistenceError = new Error("database transaction failed");
    const repository = createRepository();
    repository.replaceTechnicianServiceCover.mockRejectedValueOnce(persistenceError);
    repository.hasActiveMediaUrl.mockResolvedValueOnce(false);
    const storage = createStorage({ created: true });
    storage.delete.mockRejectedValueOnce(new Error("private storage path leaked"));
    const warning = jest.spyOn(logger, "warn").mockImplementation(() => undefined);

    await expect(
      new TechnicianServiceCoverService(repository, storage, createChecksumLock()).uploadCover(
        actor,
        context,
        1,
        11,
        { bytes: jpeg, mimeType: "image/jpeg", now }
      )
    ).rejects.toBe(persistenceError);
    expect(warning).toHaveBeenCalledWith(
      { cleanupErrorName: "Error", publicId: checksumSha256 },
      "Technician service cover compensation cleanup failed"
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private storage path leaked");
    warning.mockRestore();
  });
});
