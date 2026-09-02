import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import { requireMerchantShopId } from "./merchant-shop-scope";

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
}
