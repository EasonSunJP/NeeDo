import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";
import { AppError } from "../utils/app-error";
import { ERROR_CODES } from "../constants/error-codes";
import type { ShopEmployeeCreateBody } from "../validators/shop-employee-directory.validator";
import { hash } from "bcryptjs";

export type ShopEmployeeDirectoryStatus = "active" | "on_leave" | "suspended";
export type ShopEmployeeDirectoryTechnicianRelationship = "exclusive" | "partner";

export interface ShopEmployeeDirectoryRole {
  code: string;
  names: {
    zhHans: string;
    zhHant: string;
    ja: string;
    en: string;
    ko: string;
  };
  isTechnicianRole: boolean;
}

export interface ShopEmployeeDirectoryItem {
  needoId: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  status: ShopEmployeeDirectoryStatus;
  startsAt: string;
  endsAt: string | null;
  roles: ShopEmployeeDirectoryRole[];
  technician: {
    needoId: string;
    relationshipType: ShopEmployeeDirectoryTechnicianRelationship;
    workStatus: ShopEmployeeDirectoryStatus;
  } | null;
}

export interface ShopEmployeeDirectoryListInput extends PaginationInput {
  keyword?: string;
  status?: ShopEmployeeDirectoryStatus;
  roleCode?: string;
}

export interface ShopEmployeeDirectoryRepositoryInput extends ShopEmployeeDirectoryListInput {
  shopId: number;
}

export interface ShopEmployeeDirectoryRepositoryPort {
  createEmployee(input: Omit<ShopEmployeeCreateBody, "password"> & { passwordHash: string; shopId: number; actorUserId: number; now: Date }): Promise<ShopEmployeeDirectoryItem>;
  listCurrentShopEmployees(
    input: ShopEmployeeDirectoryRepositoryInput
  ): Promise<PaginatedResponse<ShopEmployeeDirectoryItem>>;
}

type AuditRecorder = Pick<AuditLogService, "record">;

export class ShopEmployeeDirectoryService {
  public constructor(
    private readonly repository: ShopEmployeeDirectoryRepositoryPort,
    private readonly auditLogService: AuditRecorder
  ) {}

  public async listCurrentShopEmployees(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ShopEmployeeDirectoryListInput
  ): Promise<PaginatedResponse<ShopEmployeeDirectoryItem>> {
    const shopId = requireMerchantShopId(actor);
    const result = await this.repository.listCurrentShopEmployees({ shopId, ...input });
    await this.auditLogService.record({
      actor,
      action: "merchant_admin.employee_directory.list",
      targetType: "shop_employee",
      context,
      metadata: { shopId }
    });
    return result;
  }

  public async listShopEmployees(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number,
    input: ShopEmployeeDirectoryListInput
  ): Promise<PaginatedResponse<ShopEmployeeDirectoryItem>> {
    const result = await this.repository.listCurrentShopEmployees({ ...input, shopId });
    await this.auditLogService.record({ actor, action: "backoffice.employee_directory.list", targetType: "shop_employee", context, metadata: { shopId } });
    return result;
  }

  public async createEmployee(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: ShopEmployeeCreateBody,
    shopId?: number
  ): Promise<ShopEmployeeDirectoryItem> {
    if (actor.isReadOnlyMerchantPreview) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.merchant_preview.read_only", statusCode: 403 });
    }
    const effectiveShopId = shopId ?? requireMerchantShopId(actor);
    const employee = await this.repository.createEmployee({
      displayName: input.displayName,
      email: input.email,
      passwordHash: await hash(input.password, 12),
      roleCode: input.roleCode,
      shopId: effectiveShopId,
      actorUserId: actor.userId,
      now: new Date()
    });
    await this.auditLogService.record({
      actor,
      action: shopId === undefined ? "merchant_admin.employee_directory.create" : "backoffice.employee_directory.create",
      targetType: "shop_employee",
      context,
      metadata: { shopId: effectiveShopId, needoId: employee.needoId, roleCode: input.roleCode }
    });
    return employee;
  }
}
