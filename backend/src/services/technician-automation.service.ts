import { ERROR_CODES } from "../constants/error-codes";
import { TECHNICIAN_AUTOMATION_PERMISSIONS } from "../constants/permissions.constants";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import {
  defaultTechnicianAutomationRules,
  technicianAutomationRulesSchema,
  type TechnicianAutomationContactListQuery,
  type TechnicianAutomationKindValue,
  type TechnicianAutomationRules,
  type TechnicianAutomationSettingsUpdate
} from "../validators/technician-automation.validator";

export interface TechnicianAutomationSettingRecord {
  id: number;
  technicianProfileId: number;
  kind: TechnicianAutomationKindValue;
  enabled: boolean;
  rules: unknown;
  version: number;
  updatedAt: Date;
}

export interface TechnicianAutomationSettingPayload {
  kind: TechnicianAutomationKindValue;
  enabled: boolean;
  entitled: boolean;
  testBadgeEnabled: boolean;
  rules: TechnicianAutomationRules;
  version: number;
  updatedAt: string | null;
}

export interface TechnicianAutomationContactPage {
  list: Array<{ identityId: number; publicId: string; displayName: string; avatarUrl: string | null }>;
  total: number;
  page: number;
  page_size: number;
}

export interface TechnicianAutomationSettingSaveInput {
  technicianProfileId: number;
  actorUserId: number;
  kind: TechnicianAutomationKindValue;
  enabled: boolean;
  rules: TechnicianAutomationRules;
  expectedVersion: number;
  audit: AuditLogCreateInput;
}

export type TechnicianAutomationSettingSaveResult =
  | { outcome: "ok"; setting: TechnicianAutomationSettingRecord }
  | { outcome: "version_conflict"; currentVersion: number };

export interface TechnicianAutomationRepositoryPort {
  findSetting(technicianProfileId: number, kind: TechnicianAutomationKindValue): Promise<TechnicianAutomationSettingRecord | null>;
  saveSetting(input: TechnicianAutomationSettingSaveInput): Promise<TechnicianAutomationSettingSaveResult>;
  listContacts(input: { ownerIdentityId: number; page: number; pageSize: number; search?: string }): Promise<TechnicianAutomationContactPage>;
}

export class TechnicianAutomationService {
  public constructor(private readonly repository: TechnicianAutomationRepositoryPort) {}

  public async getSetting(
    access: AuthenticatedAccessContext,
    kind: TechnicianAutomationKindValue
  ): Promise<TechnicianAutomationSettingPayload> {
    const technicianProfileId = this.requireTechnician(access);
    const setting = await this.repository.findSetting(technicianProfileId, kind);
    return setting
      ? this.mapSetting(setting, access)
      : {
          kind,
          enabled: false,
          entitled: this.isEntitled(access),
          testBadgeEnabled: true,
          rules: defaultTechnicianAutomationRules(kind),
          version: 1,
          updatedAt: null
        };
  }

  public async updateSetting(
    access: AuthenticatedAccessContext,
    kind: TechnicianAutomationKindValue,
    input: TechnicianAutomationSettingsUpdate,
    context: AuthRequestContext
  ): Promise<TechnicianAutomationSettingPayload> {
    const technicianProfileId = this.requireTechnician(access);
    if (!this.isEntitled(access)) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.auth.permission_forbidden", statusCode: 403 });
    }
    const result = await this.repository.saveSetting({
      technicianProfileId,
      actorUserId: access.userId,
      kind,
      enabled: input.enabled,
      rules: input.rules,
      expectedVersion: input.expectedVersion,
      audit: {
        actorId: access.userId,
        action: "technician.automation_settings.update",
        targetType: "technician_automation_setting",
        ip: context.ip,
        userAgent: context.userAgent,
        metadata: { technicianProfileId }
      }
    });
    if (result.outcome === "version_conflict") {
      throw new AppError({
        code: ERROR_CODES.TECHNICIAN_AUTOMATION_VERSION_CONFLICT,
        message: "error.technician_automation.version_conflict",
        statusCode: 409,
        data: { currentVersion: result.currentVersion }
      });
    }
    return this.mapSetting(result.setting, access);
  }

  public listContacts(
    access: AuthenticatedAccessContext,
    input: TechnicianAutomationContactListQuery
  ): Promise<TechnicianAutomationContactPage> {
    this.requireTechnician(access);
    return this.repository.listContacts({
      ownerIdentityId: access.currentIdentityId!,
      page: input.page,
      pageSize: input.page_size,
      ...(input.search ? { search: input.search } : {})
    });
  }

  private requireTechnician(access: AuthenticatedAccessContext): number {
    if (
      access.currentIdentityType !== "technician" ||
      access.currentIdentityScopeType !== "technician_profile" ||
      !access.currentIdentityId ||
      !access.currentIdentityScopeId
    ) {
      throw new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.auth.identity_forbidden", statusCode: 403 });
    }
    return access.currentIdentityScopeId;
  }

  private isEntitled(access: AuthenticatedAccessContext): boolean {
    return access.permissions?.includes(TECHNICIAN_AUTOMATION_PERMISSIONS.write) ?? false;
  }

  private mapSetting(setting: TechnicianAutomationSettingRecord, access: AuthenticatedAccessContext): TechnicianAutomationSettingPayload {
    return {
      kind: setting.kind,
      enabled: setting.enabled,
      entitled: this.isEntitled(access),
      testBadgeEnabled: true,
      rules: technicianAutomationRulesSchema.parse(setting.rules),
      version: setting.version,
      updatedAt: setting.updatedAt.toISOString()
    };
  }
}
