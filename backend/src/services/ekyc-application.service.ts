import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  approveEkycBodySchema,
  createEkycBodySchema,
  ekycVersionSchema,
  rejectEkycBodySchema,
  type EkycProfile
} from "../validators/ekyc-application.validator";
import { BankAccountHolderService } from "./bank-account-holder.service";
import type { SensitiveFieldCipherService } from "./sensitive-field-cipher.service";
export interface EkycApplicationRecord {
  id: number;
  userId: number;
  status: string;
  version: number;
  profileEncrypted: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewerUserId: number | null;
  reviewNote: string | null;
  rejectionReason: string | null;
  deletedAt: Date | null;
}
export interface EkycListQuery {
  page: number;
  page_size: number;
  status?: string;
}
export interface EkycDecision {
  id: number;
  userId: number;
  actorId: number;
  expectedVersion: number;
  status: "approved" | "rejected" | "withdrawn";
  reviewNote?: string;
  rejectionReason?: string;
  now: Date;
  verification?: Prisma.EkycVerificationUncheckedCreateInput;
}
export interface EkycApplicationRepositoryPort {
  find(id: number): Promise<EkycApplicationRecord | null>;
  list(
    userId: number | undefined,
    query: EkycListQuery
  ): Promise<{ list: EkycApplicationRecord[]; total: number; page: number; page_size: number }>;
  create(input: {
    userId: number;
    profileEncrypted: string;
    now: Date;
  }): Promise<EkycApplicationRecord>;
  decide(input: EkycDecision): Promise<EkycApplicationRecord>;
}
export const ekycError = (key: string, statusCode = 409) =>
  new AppError({
    code:
      statusCode === 404
        ? ERROR_CODES.NOT_FOUND
        : statusCode === 403
          ? ERROR_CODES.FORBIDDEN
          : ERROR_CODES.SAAS_BILLING_CONFLICT,
    message: `error.ekyc_application.${key}`,
    statusCode
  });
export class EkycApplicationService {
  public constructor(
    private readonly repository: EkycApplicationRepositoryPort,
    private readonly cipher: SensitiveFieldCipherService
  ) {}
  public async list(userId: number | undefined, query: EkycListQuery) {
    const result = await this.repository.list(userId, query);
    return { ...result, list: result.list.map((row) => this.summary(row)) };
  }
  public async detail(id: number, userId?: number) {
    return this.detailRecord(await this.requireRow(id, userId));
  }
  public async create(userId: number, body: unknown) {
    const { profile } = createEkycBodySchema.parse(body);
    return this.detailRecord(
      await this.repository.create({
        userId,
        profileEncrypted: this.cipher.seal(JSON.stringify(profile)),
        now: new Date()
      })
    );
  }
  public async decide(id: number, actorId: number, status: EkycDecision["status"], body: unknown) {
    const data =
      status === "approved"
        ? approveEkycBodySchema.parse(body)
        : status === "rejected"
          ? rejectEkycBodySchema.parse(body)
          : ekycVersionSchema.parse(body);
    const row = await this.requireRow(id, status === "withdrawn" ? actorId : undefined);
    if (status !== "withdrawn" && row.userId === actorId)
      throw ekycError("self_review_forbidden", 403);
    if (row.version !== data.expectedVersion || row.status !== "submitted")
      throw ekycError("version_conflict");
    const now = new Date();
    const input: EkycDecision = {
      id,
      userId: row.userId,
      actorId,
      status,
      expectedVersion: data.expectedVersion,
      now
    };
    if ("rejectionReason" in data && typeof data.rejectionReason === "string")
      input.rejectionReason = data.rejectionReason;
    if ("reviewNote" in data && typeof data.reviewNote === "string") {
      input.reviewNote = data.reviewNote;
      const profile = this.profile(row),
        name = `${profile.familyName} ${profile.givenName}`,
        kana = `${profile.familyNameKana} ${profile.givenNameKana}`;
      input.verification = {
        userId: row.userId,
        provider: "operations_manual",
        providerReference: `manual-application-${id}`,
        status: "verified",
        verifiedNameEncrypted: this.cipher.seal(name),
        verifiedNameKanaEncrypted: this.cipher.seal(kana),
        nameMatchHash: this.cipher.matchHash(
          new BankAccountHolderService().normalizeForMatch("individual", kana)
        ),
        resultHash: createHash("sha256")
          .update(
            JSON.stringify({
              applicationId: id,
              actorId,
              status,
              version: row.version,
              verifiedAt: now.toISOString(),
              profileEncrypted: row.profileEncrypted
            })
          )
          .digest("hex"),
        verifiedAt: now,
        expiresAt: null
      };
    }
    return this.detailRecord(await this.repository.decide(input));
  }
  private async requireRow(id: number, userId?: number) {
    const row = await this.repository.find(id);
    if (!row || row.deletedAt || (userId !== undefined && row.userId !== userId))
      throw ekycError("not_found", 404);
    return row;
  }
  private profile(row: EkycApplicationRecord): EkycProfile {
    return JSON.parse(this.cipher.open(row.profileEncrypted)) as EkycProfile;
  }
  private summary(row: EkycApplicationRecord) {
    return {
      id: row.id,
      userId: row.userId,
      status: row.status,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      reviewedAt: row.reviewedAt,
      reviewNote: row.reviewNote,
      rejectionReason: row.rejectionReason
    };
  }
  private detailRecord(row: EkycApplicationRecord) {
    return { ...this.summary(row), profile: this.profile(row) };
  }
}
