import ExcelJS from "exceljs";
import {
  TechnicianResumeExportService,
  type TechnicianResumeAuditPort,
  type TechnicianResumeMediaPort,
  type TechnicianResumeRepositoryPort
} from "../src/services/technician-resume-export.service";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZB5sAAAAASUVORK5CYII=",
  "base64"
);

const createRepository = (): jest.Mocked<TechnicianResumeRepositoryPort> => ({
  findForExport: jest.fn().mockResolvedValue({
    applicationId: 11,
    applicantUserId: 7,
    targetShopId: 21,
    targetShopName: "GINZA Calm Body Lab",
    status: "submitted",
    applicantName: "山本/太郎",
    phone: "09000000000",
    city: "东京",
    serviceAreas: ["银座", "有乐町"],
    skills: ["按摩", "芳香护理"],
    yearsExperience: 4,
    bio: "四年经验",
    gender: "male",
    birthDate: new Date("1990-01-02T00:00:00.000Z"),
    submittedAt: new Date("2026-08-25T05:00:00.000Z"),
    media: [
      { id: 101, purpose: "portrait", mimeType: "image/png" },
      { id: 102, purpose: "identity_document", mimeType: "image/png" }
    ]
  })
});

const createMedia = (): jest.Mocked<TechnicianResumeMediaPort> => ({
  read: jest.fn(async (mediaAssetId) => {
    void mediaAssetId;
    return { buffer: onePixelPng, extension: "png" as const };
  })
});

const createAudit = (): jest.Mocked<TechnicianResumeAuditPort> => ({
  recordSensitiveDownload: jest.fn(async (input) => {
    void input;
  })
});

describe("TechnicianResumeExportService", () => {
  it("creates one printable XLSX resume with every field and embedded images", async () => {
    const repository = createRepository();
    const media = createMedia();
    const audit = createAudit();
    const service = new TechnicianResumeExportService(repository, media, audit);

    const result = await service.export({
      applicationId: 11,
      reviewerUserId: 30,
      reviewerShopId: 21,
      exportedAt: new Date("2026-08-26T05:00:00.000Z")
    });

    expect(result.filename).toBe("技师入住申请_山本_太郎_NeeDoID7_20260825.xlsx");
    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(Buffer.isBuffer(result.buffer)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.getWorksheet("技师入住申请");
    expect(sheet).toBeDefined();
    const text = sheet
      ?.getSheetValues()
      .flat(2)
      .filter((value): value is string => typeof value === "string")
      .join("|");
    expect(text).toContain("山本/太郎");
    expect(text).toContain("09000000000");
    expect(text).toContain("银座、有乐町");
    expect(text).toContain("按摩、芳香护理");
    expect(text).toContain("1990-01-02");
    expect(sheet?.getImages()).toHaveLength(2);
    expect(sheet?.pageSetup).toMatchObject({
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1
    });
    expect(sheet?.pageSetup.printArea).toMatch(/^A1:F\d+$/u);
    expect(sheet?.getCell("A1").font.name).toBe("Hiragino Sans GB");
    expect(media.read).toHaveBeenCalledTimes(2);
    expect(audit.recordSensitiveDownload).toHaveBeenCalledWith({
      applicationId: 11,
      reviewerUserId: 30,
      reviewerShopId: 21,
      exportedAt: new Date("2026-08-26T05:00:00.000Z"),
      mediaCount: 2
    });
  });

  it("returns not found for another shop and never audits or persists an export", async () => {
    const repository = createRepository();
    repository.findForExport.mockResolvedValue(null);
    const audit = createAudit();
    const service = new TechnicianResumeExportService(repository, createMedia(), audit);

    await expect(
      service.export({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 99,
        exportedAt: new Date("2026-08-26T05:00:00.000Z")
      })
    ).rejects.toMatchObject({ message: "error.identity_application.not_found", statusCode: 404 });
    expect(audit.recordSensitiveDownload).not.toHaveBeenCalled();
  });
});
