import ExcelJS from "exceljs";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export interface TechnicianResumeRecord {
  applicationId: number;
  applicantUserId: number;
  targetShopId: number;
  targetShopName: string;
  status: string;
  applicantName: string;
  phone: string | null;
  city: string | null;
  serviceAreas: string[];
  skills: string[];
  yearsExperience: number | null;
  bio: string | null;
  gender: string | null;
  birthDate: Date | null;
  submittedAt: Date;
  media: Array<{ id: number; purpose: string; mimeType: string }>;
}

export interface TechnicianResumeRepositoryPort {
  findForExport: (applicationId: number, shopId: number) => Promise<TechnicianResumeRecord | null>;
}

export interface TechnicianResumeMediaPort {
  read: (mediaAssetId: number) => Promise<{ buffer: Buffer; extension: "png" | "jpeg" | "gif" }>;
}

export interface TechnicianResumeDownloadAuditInput {
  applicationId: number;
  reviewerUserId: number;
  reviewerShopId: number;
  exportedAt: Date;
  mediaCount: number;
}

export interface TechnicianResumeAuditPort {
  recordSensitiveDownload: (input: TechnicianResumeDownloadAuditInput) => Promise<void>;
}

export interface ExportTechnicianResumeInput {
  applicationId: number;
  reviewerUserId: number;
  reviewerShopId: number;
  exportedAt: Date;
}

export interface TechnicianResumeExportResult {
  filename: string;
  contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  buffer: Buffer;
}

const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const FONT_NAME = "Hiragino Sans GB";

export class TechnicianResumeExportService {
  public constructor(
    private readonly repository: TechnicianResumeRepositoryPort,
    private readonly media: TechnicianResumeMediaPort,
    private readonly audit: TechnicianResumeAuditPort
  ) {}

  public async export(input: ExportTechnicianResumeInput): Promise<TechnicianResumeExportResult> {
    const record = await this.repository.findForExport(input.applicationId, input.reviewerShopId);
    if (!record) {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.identity_application.not_found",
        statusCode: 404
      });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "NeeDo";
    workbook.created = input.exportedAt;
    workbook.modified = input.exportedAt;
    const sheet = workbook.addWorksheet("技师入住申请", {
      pageSetup: {
        orientation: "portrait",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
      },
      properties: { defaultRowHeight: 21 }
    });
    sheet.columns = [
      { width: 15 },
      { width: 15 },
      { width: 17 },
      { width: 17 },
      { width: 17 },
      { width: 17 }
    ];

    sheet.mergeCells("A1:F2");
    const title = sheet.getCell("A1");
    title.value = "NeeDo 技师入住申请简历";
    title.font = { name: FONT_NAME, size: 20, bold: true, color: { argb: "FFFFFFFF" } };
    title.alignment = { vertical: "middle", horizontal: "center" };
    title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14232D" } };

    let row = 4;
    row = this.addField(sheet, row, "申请编号", String(record.applicationId));
    row = this.addField(sheet, row, "NeeDo ID", String(record.applicantUserId));
    row = this.addField(sheet, row, "申请店铺", record.targetShopName);
    row = this.addField(sheet, row, "姓名（必填）", record.applicantName);
    row = this.addField(sheet, row, "性别（选填）", this.formatGender(record.gender));
    row = this.addField(
      sheet,
      row,
      "生日（选填）",
      record.birthDate ? this.formatDate(record.birthDate, "-") : "未填写"
    );
    row = this.addField(sheet, row, "电话（选填）", record.phone ?? "未填写");
    row = this.addField(sheet, row, "城市（选填）", record.city ?? "未填写");
    row = this.addField(
      sheet,
      row,
      "服务区域（选填）",
      record.serviceAreas.length > 0 ? record.serviceAreas.join("、") : "未填写"
    );
    row = this.addField(
      sheet,
      row,
      "技能（选填）",
      record.skills.length > 0 ? record.skills.join("、") : "未填写"
    );
    row = this.addField(
      sheet,
      row,
      "从业年数（选填）",
      record.yearsExperience === null ? "未填写" : `${record.yearsExperience} 年`
    );
    row = this.addField(sheet, row, "基础介绍（选填）", record.bio ?? "未填写", 48);
    row = this.addField(
      sheet,
      row,
      "提交时间",
      `${this.formatDate(record.submittedAt, "-")} ${record.submittedAt
        .toISOString()
        .slice(11, 16)} UTC`
    );

    sheet.mergeCells(`A${row}:F${row}`);
    const mediaHeading = sheet.getCell(`A${row}`);
    mediaHeading.value = "本人照片与证件照片（申请人选填）";
    mediaHeading.font = { name: FONT_NAME, bold: true, color: { argb: "FF14232D" } };
    mediaHeading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F5D7" } };
    mediaHeading.alignment = { vertical: "middle", horizontal: "left" };
    row += 1;

    for (let index = 0; index < record.media.length; index += 1) {
      const asset = record.media[index];
      if (!asset) continue;
      const image = await this.media.read(asset.id);
      const imageId = workbook.addImage({
        buffer: image.buffer as never,
        extension: image.extension
      });
      const startColumn = index % 2 === 0 ? 0 : 3;
      const imageRow = row + Math.floor(index / 2) * 9;
      const startLetter = startColumn === 0 ? "A" : "D";
      const endLetter = startColumn === 0 ? "C" : "F";
      sheet.addImage(imageId, `${startLetter}${imageRow}:${endLetter}${imageRow + 6}`);
      sheet.mergeCells(imageRow + 7, startColumn + 1, imageRow + 7, startColumn + 3);
      const caption = sheet.getCell(imageRow + 7, startColumn + 1);
      caption.value = asset.purpose;
      caption.alignment = { horizontal: "center" };
      caption.font = { name: FONT_NAME, size: 9, color: { argb: "FF53636C" } };
    }
    row += Math.max(1, Math.ceil(record.media.length / 2)) * 9;

    sheet.mergeCells(`A${row}:F${row + 1}`);
    const warning = sheet.getCell(`A${row}`);
    warning.value =
      "隐私提示：本简历由店铺主动下载到本地。下载方负责依据适用法律和 NeeDo 规则妥善保管，不得超出审核与入驻联系目的使用。";
    warning.alignment = { wrapText: true, vertical: "middle" };
    warning.font = { name: FONT_NAME, size: 9, color: { argb: "FF7A4B00" } };
    warning.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0D6" } };

    const finalRow = row + 1;
    sheet.pageSetup.printArea = `A1:F${finalRow}`;
    sheet.eachRow((currentRow) => {
      currentRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { ...cell.font, name: FONT_NAME };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD6E0E5" } },
          left: { style: "thin", color: { argb: "FFD6E0E5" } },
          bottom: { style: "thin", color: { argb: "FFD6E0E5" } },
          right: { style: "thin", color: { argb: "FFD6E0E5" } }
        };
      });
    });

    const output = Buffer.from(await workbook.xlsx.writeBuffer());
    await this.audit.recordSensitiveDownload({
      applicationId: record.applicationId,
      reviewerUserId: input.reviewerUserId,
      reviewerShopId: input.reviewerShopId,
      exportedAt: input.exportedAt,
      mediaCount: record.media.length
    });

    return {
      filename: this.filename(record),
      contentType: CONTENT_TYPE,
      buffer: output
    };
  }

  private addField(
    sheet: ExcelJS.Worksheet,
    row: number,
    label: string,
    value: string,
    height = 24
  ): number {
    sheet.mergeCells(row, 1, row, 2);
    sheet.mergeCells(row, 3, row, 6);
    const labelCell = sheet.getCell(row, 1);
    labelCell.value = label;
    labelCell.font = { name: FONT_NAME, bold: true, color: { argb: "FF53636C" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6F8" } };
    labelCell.alignment = { vertical: "middle" };
    const valueCell = sheet.getCell(row, 3);
    valueCell.value = value;
    valueCell.font = { name: FONT_NAME, color: { argb: "FF14232D" } };
    valueCell.alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(row).height = height;
    return row + 1;
  }

  private filename(record: TechnicianResumeRecord): string {
    const safeName = record.applicantName.replace(/[\\/:*?"<>|]/gu, "_").trim() || "未命名";
    return `技师入住申请_${safeName}_NeeDoID${record.applicantUserId}_${this.formatDate(
      record.submittedAt,
      ""
    )}.xlsx`;
  }

  private formatDate(value: Date, separator: string): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return [year, month, day].join(separator);
  }

  private formatGender(value: string | null): string {
    return (
      {
        male: "男",
        female: "女",
        other: "其他",
        undisclosed: "不公开"
      }[value ?? ""] ?? "未填写"
    );
  }
}
