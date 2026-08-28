import { ERROR_CODES } from "../constants/error-codes";
import type {
  AffiliateProfileChannelMutation,
  AffiliateProfileChannelPayload,
  AffiliateProfileMutation,
  AffiliateProfilePayload,
  AffiliateProfileRepositoryPort
} from "../repositories/affiliate-profile.repository";
import { AppError } from "../utils/app-error";
import type {
  AffiliateChannelCreateBody,
  AffiliateChannelUpdateBody,
  AffiliateProfileUpdateBody
} from "../validators/affiliate-profile.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type {
  AffiliateChannelPlatform,
  AffiliateChannelUrlService
} from "./affiliate-channel-url.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export { type AffiliateProfilePayload } from "../repositories/affiliate-profile.repository";

export class AffiliateProfileService {
  public constructor(
    private readonly repository: AffiliateProfileRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly channelUrlService: AffiliateChannelUrlService
  ) {}

  public async getMine(actor: AuthenticatedAccessContext): Promise<AffiliateProfilePayload> {
    this.requireAffiliateIdentity(actor);
    const profile = await this.repository.findMine(actor.userId);
    if (!profile) throw this.notFound();
    return profile;
  }

  public async updateMine(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AffiliateProfileUpdateBody
  ): Promise<AffiliateProfilePayload> {
    const profile = await this.getActiveProfile(actor);
    this.requireVersion(profile, input.expectedVersion);
    const mutation = this.profileMutation(input);
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "affiliate_profile.updated",
      targetType: "AffiliateProfile",
      targetId: profile.profileId,
      metadata: { changedFields: this.changedFields(input, "expectedVersion") }
    });
    return this.repository.updateMine(actor.userId, input.expectedVersion, mutation, auditLog);
  }

  public async createChannel(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: AffiliateChannelCreateBody
  ): Promise<AffiliateProfilePayload> {
    const profile = await this.getActiveProfile(actor);
    this.requireVersion(profile, input.expectedProfileVersion);
    if (profile.channels.length >= 10) throw this.channelLimit();

    const customLabel = this.normalizeCustomLabel(input.customLabel);
    this.assertCustomLabel(input.platform, customLabel);
    const mutation: Required<AffiliateProfileChannelMutation> = {
      platform: input.platform,
      customLabel,
      homepageUrl: this.channelUrlService.normalize(input.platform, input.homepageUrl),
      sortOrder: input.sortOrder
    };
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "affiliate_profile.channel_created",
      targetType: "AffiliateProfile",
      targetId: profile.profileId,
      metadata: {
        changedFields: ["customLabel", "homepageUrl", "platform", "sortOrder"]
      }
    });
    return this.repository.createChannel(
      actor.userId,
      input.expectedProfileVersion,
      mutation,
      auditLog
    );
  }

  public async updateChannel(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    channelId: number,
    input: AffiliateChannelUpdateBody
  ): Promise<AffiliateProfilePayload> {
    const profile = await this.getActiveProfile(actor);
    this.requireVersion(profile, input.expectedProfileVersion);
    const current = this.requireOwnedChannel(profile, channelId);
    const platform = input.platform ?? current.platform;
    const customLabel =
      input.customLabel === undefined
        ? current.customLabel
        : this.normalizeCustomLabel(input.customLabel);
    this.assertCustomLabel(platform, customLabel);
    const homepageUrl = this.channelUrlService.normalize(
      platform,
      input.homepageUrl ?? current.homepageUrl
    );

    const mutation: AffiliateProfileChannelMutation = {
      ...(input.platform !== undefined ? { platform } : {}),
      ...(input.customLabel !== undefined ? { customLabel } : {}),
      ...(input.homepageUrl !== undefined ? { homepageUrl } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {})
    };
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "affiliate_profile.channel_updated",
      targetType: "AffiliateProfile",
      targetId: profile.profileId,
      metadata: { changedFields: this.changedFields(input, "expectedProfileVersion") }
    });
    return this.repository.updateChannel(
      actor.userId,
      channelId,
      input.expectedProfileVersion,
      mutation,
      auditLog
    );
  }

  public async deleteChannel(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    channelId: number,
    expectedProfileVersion: number
  ): Promise<AffiliateProfilePayload> {
    const profile = await this.getActiveProfile(actor);
    this.requireVersion(profile, expectedProfileVersion);
    this.requireOwnedChannel(profile, channelId);
    const auditLog = this.auditLogService.createInput({
      actor,
      context,
      action: "affiliate_profile.channel_deleted",
      targetType: "AffiliateProfile",
      targetId: profile.profileId,
      metadata: { changedFields: ["deletedAt"] }
    });
    return this.repository.deleteChannel(actor.userId, channelId, expectedProfileVersion, auditLog);
  }

  private async getActiveProfile(
    actor: AuthenticatedAccessContext
  ): Promise<AffiliateProfilePayload> {
    const profile = await this.getMine(actor);
    if (profile.affiliateStatus !== "active") throw this.notFound();
    return profile;
  }

  private requireAffiliateIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityType !== "scout") {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.affiliate_profile.identity_required",
        statusCode: 403
      });
    }
  }

  private requireVersion(profile: AffiliateProfilePayload, expectedVersion: number): void {
    if (profile.version !== expectedVersion) {
      throw new AppError({
        code: ERROR_CODES.AFFILIATE_PROFILE_VERSION_CONFLICT,
        message: "error.affiliate_profile.version_conflict",
        statusCode: 409
      });
    }
  }

  private requireOwnedChannel(
    profile: AffiliateProfilePayload,
    channelId: number
  ): AffiliateProfileChannelPayload {
    const channel = profile.channels.find((item) => item.channelId === channelId);
    if (!channel) throw this.notFound();
    return channel;
  }

  private profileMutation(input: AffiliateProfileUpdateBody): AffiliateProfileMutation {
    return {
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.strengths !== undefined
        ? { strengths: this.normalizeStrings(input.strengths) }
        : {}),
      ...(input.serviceAreas !== undefined
        ? { serviceAreas: this.normalizeStrings(input.serviceAreas) }
        : {}),
      ...(input.cooperationStatus !== undefined
        ? { cooperationStatus: input.cooperationStatus }
        : {})
    };
  }

  private normalizeStrings(values: string[]): string[] {
    return Array.from(new Set(values.map((value) => value.trim())));
  }

  private normalizeCustomLabel(value: string | null | undefined): string | null {
    return value == null ? null : value.trim();
  }

  private assertCustomLabel(platform: AffiliateChannelPlatform, customLabel: string | null): void {
    const valid = platform === "custom" ? Boolean(customLabel) : customLabel === null;
    if (!valid) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.affiliate_profile.channel_label_invalid",
        statusCode: 400
      });
    }
  }

  private changedFields(input: object, versionField: string): string[] {
    return Object.keys(input)
      .filter((field) => field !== versionField)
      .sort();
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_NOT_FOUND,
      message: "error.affiliate_profile.not_found",
      statusCode: 404
    });
  }

  private channelLimit(): AppError {
    return new AppError({
      code: ERROR_CODES.AFFILIATE_PROFILE_CHANNEL_LIMIT,
      message: "error.affiliate_profile.channel_limit",
      statusCode: 409
    });
  }
}
