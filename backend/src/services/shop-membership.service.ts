import { ERROR_CODES } from "../constants/error-codes";
import type {
  MembershipCardListInput,
  MembershipListInput,
  ShopMembershipAnalyticsPeriod,
  ShopMembershipRepositoryPort
} from "../repositories/shop-membership.repository";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

const merchantShopIdentityTypes = new Set(["merchant", "merchant_owner", "merchant_staff"]);

export class ShopMembershipService {
  public constructor(
    private readonly repository: ShopMembershipRepositoryPort,
    private readonly auditInputFactory: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async getMerchantOverview(actor: AuthenticatedAccessContext) {
    const shopId = this.requireMerchantShop(actor);
    const now = this.now();
    const todayStart = this.startOfJapanDay(now);
    const expiryCutoff = new Date(todayStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const overview = await this.repository.getOverview(shopId, todayStart, expiryCutoff);
    if (!overview) throw this.notFound("error.shop_membership.shop_not_found");
    return actor.permissions.includes("shop.member.operation_log.view")
      ? overview
      : { ...overview, recentActivities: [] };
  }

  public async listMerchantMemberships(actor: AuthenticatedAccessContext, input: MembershipListInput) {
    const page = await this.repository.listMemberships(this.requireMerchantShop(actor), input);
    return { ...page, list: page.list.map((item) => this.toPublicMerchantDetail(item)) };
  }

  public async getMerchantMembershipDetail(actor: AuthenticatedAccessContext, publicId: string) {
    const detail = await this.repository.findMembershipDetail(this.requireMerchantShop(actor), publicId);
    if (!detail) throw this.notFound("error.shop_membership.not_found");
    return this.toPublicMerchantDetail(detail);
  }

  public async listMerchantCandidates(actor: AuthenticatedAccessContext, input: Omit<MembershipListInput, "status">) {
    return this.repository.listCandidates(this.requireMerchantShop(actor), input);
  }

  public async enrollMerchantMembership(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { customerNeedoId: string }
  ) {
    const shopId = this.requireMerchantShop(actor);
    const customerNeedoId = input.customerNeedoId.trim().toLowerCase();
    const candidate = await this.repository.findCandidateByNeedoId(shopId, customerNeedoId);
    if (!candidate) throw this.notFound("error.shop_membership.candidate_not_found");
    try {
      const detail = await this.repository.createMembershipWithAudit({
        actorId: actor.userId,
        customerNeedoId,
        customerProfileId: candidate.customerProfileId,
        shopId,
        shopNo: candidate.shopNo,
        audit: this.auditInputFactory.createInput({
          actor,
          context,
          action: "merchant.shop_membership.create",
          targetType: "ShopCustomerMembership",
          metadata: { customerNeedoId, shopNo: candidate.shopNo, source: "merchant_manual" }
        })
      });
      return this.toPublicMerchantDetail(detail);
    } catch (error) {
      if (this.isActiveMembershipConflict(error)) {
        throw new AppError({
          code: ERROR_CODES.SHOP_MEMBERSHIP_ALREADY_ACTIVE,
          message: "error.shop_membership.already_active",
          statusCode: 409
        });
      }
      throw error;
    }
  }

  public async listMerchantCards(actor: AuthenticatedAccessContext, input: MembershipCardListInput) {
    return this.repository.listCards(this.requireMerchantShop(actor), input);
  }

  public async listMerchantActivities(actor: AuthenticatedAccessContext, input: PaginationInput) {
    return this.repository.listActivities(this.requireMerchantShop(actor), input);
  }

  public async getMerchantAnalytics(actor: AuthenticatedAccessContext, period: ShopMembershipAnalyticsPeriod) {
    const shopId = this.requireMerchantShop(actor);
    const days = period === "last7days" ? 7 : period === "last90days" ? 90 : 30;
    const to = this.now();
    const toDay = this.startOfJapanDay(to);
    const from = new Date(toDay.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const dateKeys = Array.from({ length: days }, (_, index) =>
      this.japanDateKey(new Date(from.getTime() + index * 24 * 60 * 60 * 1000))
    );
    return this.repository.getAnalytics(shopId, { period, from, to, dateKeys });
  }

  public async listCustomerMemberships(actor: AuthenticatedAccessContext, input: Omit<MembershipListInput, "keyword">) {
    const page = await this.repository.listCustomerMemberships(this.requireCustomerProfile(actor), input);
    return { ...page, list: page.list.map((item) => this.toPublicCustomerDetail(item)) };
  }

  public async getCustomerMembershipDetail(actor: AuthenticatedAccessContext, publicId: string) {
    const detail = await this.repository.findCustomerMembershipDetail(this.requireCustomerProfile(actor), publicId);
    if (!detail) throw this.notFound("error.shop_membership.not_found");
    return this.toPublicCustomerDetail(detail);
  }

  private requireMerchantShop(actor: AuthenticatedAccessContext): number {
    if (
      !actor.currentIdentityType ||
      !merchantShopIdentityTypes.has(actor.currentIdentityType) ||
      actor.currentIdentityScopeType !== "shop" ||
      !actor.currentIdentityScopeId
    ) {
      throw this.identityForbidden();
    }
    return actor.currentIdentityScopeId;
  }

  private requireCustomerProfile(actor: AuthenticatedAccessContext): number {
    if (
      actor.currentIdentityType !== "customer" ||
      actor.currentIdentityScopeType !== "customer_profile" ||
      !actor.currentIdentityScopeId
    ) {
      throw this.identityForbidden();
    }
    return actor.currentIdentityScopeId;
  }

  private toPublicMerchantDetail<T extends { internalId: number; customerProfileId: number; createdAt: Date; updatedAt: Date }>(detail: T): Omit<T, "internalId" | "customerProfileId" | "createdAt" | "updatedAt"> {
    const { internalId: _internalId, customerProfileId: _customerProfileId, createdAt: _createdAt, updatedAt: _updatedAt, ...publicDetail } = detail;
    void _internalId;
    void _customerProfileId;
    void _createdAt;
    void _updatedAt;
    return publicDetail;
  }

  private toPublicCustomerDetail<T extends { internalId: number }>(detail: T): Omit<T, "internalId"> {
    const { internalId: _internalId, ...publicDetail } = detail;
    void _internalId;
    return publicDetail;
  }

  private identityForbidden(): AppError {
    return new AppError({ code: ERROR_CODES.IDENTITY_FORBIDDEN, message: "error.identity.forbidden", statusCode: 403 });
  }

  private notFound(message: string): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
  }

  private isActiveMembershipConflict(error: unknown): boolean {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") return false;
    const target = "meta" in error && error.meta && typeof error.meta === "object" && "target" in error.meta ? error.meta.target : undefined;
    return Array.isArray(target) ? target.some((item) => String(item).includes("active_key")) : String(target ?? "").includes("active_key");
  }

  private startOfJapanDay(value: Date): Date {
    const [year, month, day] = this.japanDateKey(value).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, -9, 0, 0, 0));
  }

  private japanDateKey(value: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  }
}
