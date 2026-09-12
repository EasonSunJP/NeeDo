import { ERROR_CODES } from "../constants/error-codes";
import type { AdministrativeRegionRepositoryPort } from "../repositories/administrative-region.repository";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { CustomerAddressCreateMutation, CustomerAddressMutation, CustomerAddressPage, CustomerAddressPayload, CustomerAddressRepositoryPort } from "../repositories/customer-address.repository";
import type { CustomerAddressCreateBody, CustomerAddressListQuery, CustomerAddressUpdateBody } from "../validators/customer-address.validator";
import { AppError } from "../utils/app-error";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { PersonalIdentityScopeService } from "./personal-identity-scope.service";

type AuditRecorder = Pick<AuditLogService, "createInput">;

export class CustomerAddressService {
  public constructor(
    private readonly repository: CustomerAddressRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly personalIdentityScope?: Pick<PersonalIdentityScopeService, "resolve">,
    private readonly administrativeRegions?: Pick<AdministrativeRegionRepositoryPort, "resolveVerifiedScope">
  ) {}

  public async listMine(actor: AuthenticatedAccessContext, query: CustomerAddressListQuery): Promise<CustomerAddressPage> {
    const scope = await this.getCustomerScope(actor);
    return this.repository.listMine(scope.userId, scope.profileId, query);
  }

  public async createMine(actor: AuthenticatedAccessContext, context: AuthRequestContext, input: CustomerAddressCreateBody): Promise<CustomerAddressPayload> {
    const scope = await this.getCustomerScope(actor);
    return this.repository.createMine(scope.userId, scope.profileId, await this.normalizeCreate(input), this.audit(actor, context, "customer_address.self_create", null, { label: input.label.trim(), requestedDefault: input.isDefault === true }));
  }

  public async updateMine(actor: AuthenticatedAccessContext, context: AuthRequestContext, publicId: string, input: CustomerAddressUpdateBody): Promise<CustomerAddressPayload> {
    const scope = await this.getCustomerScope(actor);
    return this.repository.updateMine(scope.userId, scope.profileId, publicId, await this.normalizeUpdate(input), this.audit(actor, context, "customer_address.self_update", null, { publicId, changedFields: Object.keys(input).sort() }));
  }

  public async deleteMine(actor: AuthenticatedAccessContext, context: AuthRequestContext, publicId: string): Promise<void> {
    const scope = await this.getCustomerScope(actor);
    await this.repository.deleteMine(scope.userId, scope.profileId, publicId, this.audit(actor, context, "customer_address.self_delete", null, { publicId }));
  }

  private async normalizeCreate(input: CustomerAddressCreateBody): Promise<CustomerAddressCreateMutation> {
    const location = await this.verifyLocation(input);
    return {
      label: this.normalizeRequired(input.label),
      countryCode: "JP",
      postalCode: this.normalizePostalCode(input.postalCode),
      admin1Code: this.normalizeRequired(input.admin1Code),
      prefecture: location.prefecture,
      admin2Code: this.normalizeRequired(input.admin2Code),
      city: location.city,
      addressLine1: this.normalizeRequired(input.addressLine1),
      addressLine2: this.normalizeOptional(input.addressLine2),
      building: this.normalizeOptional(input.building),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {})
    };
  }

  private async normalizeUpdate(input: CustomerAddressUpdateBody): Promise<CustomerAddressMutation> {
    const location = input.countryCode && input.admin1Code && input.prefecture && input.admin2Code && input.city
      ? await this.verifyLocation({
          countryCode: input.countryCode,
          admin1Code: input.admin1Code,
          prefecture: input.prefecture,
          admin2Code: input.admin2Code,
          city: input.city
        })
      : null;
    return {
      ...(input.label !== undefined ? { label: this.normalizeRequired(input.label) } : {}),
      ...(input.countryCode !== undefined ? { countryCode: "JP" as const } : {}),
      ...(input.postalCode !== undefined ? { postalCode: this.normalizePostalCode(input.postalCode) } : {}),
      ...(input.admin1Code !== undefined ? { admin1Code: this.normalizeRequired(input.admin1Code) } : {}),
      ...(location ? { prefecture: location.prefecture } : {}),
      ...(input.admin2Code !== undefined ? { admin2Code: this.normalizeRequired(input.admin2Code) } : {}),
      ...(location ? { city: location.city } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: this.normalizeRequired(input.addressLine1) } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: this.normalizeOptional(input.addressLine2) } : {}),
      ...(input.building !== undefined ? { building: this.normalizeOptional(input.building) } : {}),
      ...(input.isDefault === true ? { isDefault: true as const } : {})
    };
  }

  private async verifyLocation(input: { countryCode: "JP"; admin1Code: string; prefecture: string; admin2Code: string; city: string }): Promise<{ prefecture: string; city: string }> {
    const prefecture = this.normalizeRequired(input.prefecture);
    const city = this.normalizeRequired(input.city);
    if (!this.administrativeRegions) return { prefecture, city };
    const resolved = await this.administrativeRegions.resolveVerifiedScope({
      countryCode: "JP",
      admin1Code: this.normalizeRequired(input.admin1Code),
      admin2Code: this.normalizeRequired(input.admin2Code)
    });
    if (prefecture !== resolved.admin1NameJa || city !== resolved.admin2NameJa) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.administrative_region.address_mismatch",
        statusCode: 400
      });
    }
    return { prefecture: resolved.admin1NameJa, city: resolved.admin2NameJa };
  }

  private normalizeRequired(value: string): string {
    return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  }

  private normalizeOptional(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    return this.normalizeRequired(value) || null;
  }

  private normalizePostalCode(value: string): string {
    return value.normalize("NFKC").replace(/[^0-9]/gu, "");
  }

  private audit(actor: AuthenticatedAccessContext, context: AuthRequestContext, action: string, targetId: number | null, metadata: Record<string, unknown>): AuditLogCreateInput {
    return this.auditLogService.createInput({ actor, context, action, targetType: "CustomerAddress", targetId, metadata });
  }

  private async getCustomerScope(actor: AuthenticatedAccessContext): Promise<{ userId: number; profileId: number }> {
    const scope = this.personalIdentityScope
      ? await this.personalIdentityScope.resolve(actor)
      : { userId: actor.userId, identityType: actor.currentIdentityType, scopeType: actor.currentIdentityScopeType, scopeId: actor.currentIdentityScopeId };
    if (scope.identityType !== "customer" || scope.scopeType !== "customer_profile" || !scope.scopeId) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.forbidden", statusCode: 403 });
    }
    return { userId: scope.userId, profileId: scope.scopeId };
  }
}
