import type { PrismaClient } from "@prisma/client";
import { TechnicianResumeRepository } from "../src/repositories/technician-resume.repository";

describe("TechnicianResumeRepository", () => {
  it("loads export data only for the target shop and non-purged application", async () => {
    const submittedAt = new Date("2026-08-25T05:00:00.000Z");
    const identityApplication = {
      findFirst: jest.fn().mockResolvedValue({
        id: 11,
        userId: 7,
        status: "submitted",
        submittedAt,
        technicianDetail: {
          applicantName: "山本太郎",
          phone: null,
          city: "东京",
          serviceAreas: ["银座"],
          skills: ["按摩"],
          yearsExperience: 4,
          bio: null,
          gender: null,
          birthDate: null,
          targetShopId: 21,
          targetShop: { name: "GINZA Calm Body Lab" }
        },
        media: [{ purpose: "portrait", mediaAsset: { id: 101, mimeType: "image/png" } }]
      })
    };
    const client = { identityApplication } as unknown as PrismaClient;
    const repository = new TechnicianResumeRepository("/safe/storage", client);

    await expect(repository.findForExport(11, 21)).resolves.toMatchObject({
      applicationId: 11,
      targetShopId: 21,
      targetShopName: "GINZA Calm Body Lab",
      media: [{ id: 101, purpose: "portrait", mimeType: "image/png" }]
    });
    expect(identityApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 11,
          type: "technician",
          deletedAt: null,
          purgedAt: null,
          technicianDetail: { targetShopId: 21, deletedAt: null }
        }
      })
    );
  });

  it("reads only hashed application-media filenames under the configured storage directory", async () => {
    const filename = `${"a".repeat(64)}.png`;
    const mediaAsset = {
      findFirst: jest.fn().mockResolvedValue({
        url: `/media/identity-applications/${filename}`,
        mimeType: "image/png"
      })
    };
    const readFile = jest.fn(async (path: string) => Buffer.from(path));
    const client = { mediaAsset } as unknown as PrismaClient;
    const repository = new TechnicianResumeRepository("/safe/storage", client, readFile);

    await expect(repository.read(101)).resolves.toMatchObject({ extension: "png" });
    expect(mediaAsset.findFirst).toHaveBeenCalledWith({
      where: {
        id: 101,
        entityType: "identity_application",
        isActive: true,
        deletedAt: null,
        purgedAt: null
      },
      select: { url: true, mimeType: true }
    });
    expect(readFile).toHaveBeenCalledWith(`/safe/storage/${filename}`);

    mediaAsset.findFirst.mockResolvedValueOnce({ url: "/media/identity-applications/secret.txt" });
    await expect(repository.read(102)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("audits the sensitive download without copying applicant data", async () => {
    const auditLog = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const client = { auditLog } as unknown as PrismaClient;
    const repository = new TechnicianResumeRepository("/safe/storage", client);

    await repository.recordSensitiveDownload({
      applicationId: 11,
      reviewerUserId: 30,
      reviewerShopId: 21,
      exportedAt: new Date("2026-08-26T05:00:00.000Z"),
      mediaCount: 2
    });
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 30,
        action: "identity_application.technician.resume_exported",
        targetId: 11,
        ip: null,
        metadata: { applicationId: 11, reviewerShopId: 21, mediaCount: 2 }
      })
    });
  });
});
