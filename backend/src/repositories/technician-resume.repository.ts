import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import type {
  TechnicianResumeAuditPort,
  TechnicianResumeDownloadAuditInput,
  TechnicianResumeMediaPort,
  TechnicianResumeRecord,
  TechnicianResumeRepositoryPort
} from "../services/technician-resume-export.service";
import { AppError } from "../utils/app-error";

type ReadFilePort = (path: string) => Promise<Buffer>;

const asStringArray = (value: Prisma.JsonValue | null): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class TechnicianResumeRepository
  implements TechnicianResumeRepositoryPort, TechnicianResumeMediaPort, TechnicianResumeAuditPort
{
  public constructor(
    private readonly storageDirectory: string,
    private readonly client: PrismaClient = prisma,
    private readonly readFileFromDisk: ReadFilePort = readFile
  ) {}

  public async findForExport(
    applicationId: number,
    shopId: number
  ): Promise<TechnicianResumeRecord | null> {
    const application = await this.client.identityApplication.findFirst({
      where: {
        id: applicationId,
        type: "technician",
        deletedAt: null,
        purgedAt: null,
        technicianDetail: { targetShopId: shopId, deletedAt: null }
      },
      select: {
        id: true,
        userId: true,
        status: true,
        submittedAt: true,
        technicianDetail: {
          select: {
            applicantName: true,
            phone: true,
            city: true,
            serviceAreas: true,
            skills: true,
            yearsExperience: true,
            bio: true,
            gender: true,
            birthDate: true,
            targetShopId: true,
            targetShop: { select: { name: true } }
          }
        },
        media: {
          where: {
            deletedAt: null,
            mediaAsset: { deletedAt: null, purgedAt: null, isActive: true }
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: {
            purpose: true,
            mediaAsset: { select: { id: true, mimeType: true } }
          }
        }
      }
    });
    if (!application?.technicianDetail || !application.submittedAt) {
      return null;
    }

    return {
      applicationId: application.id,
      applicantUserId: application.userId,
      targetShopId: application.technicianDetail.targetShopId,
      targetShopName: application.technicianDetail.targetShop.name,
      status: application.status,
      applicantName: application.technicianDetail.applicantName,
      phone: application.technicianDetail.phone,
      city: application.technicianDetail.city,
      serviceAreas: asStringArray(application.technicianDetail.serviceAreas),
      skills: asStringArray(application.technicianDetail.skills),
      yearsExperience: application.technicianDetail.yearsExperience,
      bio: application.technicianDetail.bio,
      gender: application.technicianDetail.gender,
      birthDate: application.technicianDetail.birthDate,
      submittedAt: application.submittedAt,
      media: application.media.map((item) => ({
        id: item.mediaAsset.id,
        purpose: item.purpose,
        mimeType: item.mediaAsset.mimeType
      }))
    };
  }

  public async read(
    mediaAssetId: number
  ): Promise<{ buffer: Buffer; extension: "png" | "jpeg" | "gif" }> {
    const asset = await this.client.mediaAsset.findFirst({
      where: {
        id: mediaAssetId,
        entityType: "identity_application",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { url: true, mimeType: true }
    });
    if (!asset) {
      throw this.notFound();
    }
    const filename = basename(asset.url);
    if (!/^[a-f0-9]{64}\.(?:png|jpe?g|gif)$/u.test(filename)) {
      throw this.notFound();
    }
    const extension = filename.endsWith(".png")
      ? "png"
      : filename.endsWith(".gif")
        ? "gif"
        : "jpeg";
    const path = resolve(this.storageDirectory, filename);
    const directory = resolve(this.storageDirectory);
    if (!path.startsWith(`${directory}/`)) {
      throw this.notFound();
    }
    return { buffer: await this.readFileFromDisk(path), extension };
  }

  public async recordSensitiveDownload(
    input: TechnicianResumeDownloadAuditInput
  ): Promise<void> {
    await this.client.auditLog.create({
      data: {
        actorId: input.reviewerUserId,
        action: "identity_application.technician.resume_exported",
        targetType: "IdentityApplication",
        targetId: input.applicationId,
        ip: null,
        userAgent: null,
        metadata: {
          applicationId: input.applicationId,
          reviewerShopId: input.reviewerShopId,
          mediaCount: input.mediaCount
        },
        createdAt: input.exportedAt
      }
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.identity_application.media_not_found",
      statusCode: 404
    });
  }
}
