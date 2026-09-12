import { describe, expect, it, jest } from "@jest/globals";
import type { AuditLogCreateInput } from "../src/repositories/audit-log.repository";
import type { CustomerAddressRepositoryPort } from "../src/repositories/customer-address.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { AuditLogRecordInput } from "../src/services/audit-log.service";
import { CustomerAddressService } from "../src/services/customer-address.service";

const actor = {
  userId: 11,
  currentIdentityId: 17,
  currentIdentityType: "customer",
  currentIdentityScopeType: "customer_profile",
  currentIdentityScopeId: 41
} as AuthenticatedAccessContext;
const context: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };
const address = {
  id: 7,
  publicId: "00000000-0000-4000-8000-000000000007",
  label: "自宅",
  countryCode: "JP" as const,
  postalCode: "1600022",
  admin1Code: "13",
  prefecture: "東京都",
  admin2Code: "13104",
  city: "新宿区",
  addressLine1: "新宿1-1-1",
  addressLine2: null,
  building: "NeeDo 301",
  isDefault: true,
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z"
};

const repository = (): jest.Mocked<CustomerAddressRepositoryPort> => ({
  createMine: jest.fn(),
  deleteMine: jest.fn(),
  listMine: jest.fn(),
  updateMine: jest.fn()
});
const audit = {
  createInput: jest.fn((input: AuditLogRecordInput): AuditLogCreateInput => ({
    action: input.action,
    actorId: input.actor.userId,
    metadata: input.metadata,
    targetId: input.targetId,
    targetType: input.targetType
  }))
};
const administrativeRegions = {
  resolveVerifiedScope: jest.fn(async (input: { countryCode: "JP"; admin1Code: string; admin2Code: string }) => ({
    ...input,
    admin1RegionId: 13,
    admin1NameJa: "東京都",
    admin2RegionId: 13104,
    admin2NameJa: "新宿区",
    datasetVersion: "N03-20260101" as const
  }))
};

describe("CustomerAddressService", () => {
  it("normalizes and creates an address only in the resolved customer profile scope", async () => {
    const store = repository();
    store.createMine.mockResolvedValue(address);
    const service = new CustomerAddressService(store, audit, undefined, administrativeRegions);

    await expect(service.createMine(actor, context, {
      label: " 自宅 ", countryCode: "JP", postalCode: "１６０－００２２",
      admin1Code: "13", prefecture: " 東京都 ", admin2Code: "13104",
      city: " 新宿区 ", addressLine1: " 新宿1-1-1 ", addressLine2: " ",
      building: " NeeDo 301 ", isDefault: true
    })).resolves.toBe(address);

    expect(store.createMine).toHaveBeenCalledWith(
      11,
      41,
      expect.objectContaining({
        label: "自宅",
        postalCode: "1600022",
        prefecture: "東京都",
        city: "新宿区",
        addressLine1: "新宿1-1-1",
        addressLine2: null,
        building: "NeeDo 301"
      }),
      expect.objectContaining({ action: "customer_address.self_create" })
    );
    expect(administrativeRegions.resolveVerifiedScope).toHaveBeenCalledWith({ countryCode: "JP", admin1Code: "13", admin2Code: "13104" });
  });

  it("rejects a code and Japanese region-name mismatch before persistence", async () => {
    const store = repository();
    const service = new CustomerAddressService(store, audit, undefined, administrativeRegions);

    await expect(service.createMine(actor, context, {
      label: "自宅", countryCode: "JP", postalCode: "1600022",
      admin1Code: "13", prefecture: "大阪府", admin2Code: "13104",
      city: "新宿区", addressLine1: "新宿1-1-1"
    })).rejects.toMatchObject({ statusCode: 400, message: "error.administrative_region.address_mismatch" });
    expect(store.createMine).not.toHaveBeenCalled();
  });

  it("scopes list, update, and delete to the authenticated customer profile", async () => {
    const store = repository();
    store.listMine.mockResolvedValue({ list: [address], total: 1, page: 1, page_size: 20 });
    store.updateMine.mockResolvedValue({ ...address, label: "会社" });
    store.deleteMine.mockResolvedValue(undefined);
    const service = new CustomerAddressService(store, audit);

    await service.listMine(actor, { page: 1, pageSize: 20 });
    await service.updateMine(actor, context, address.publicId, { label: "会社" });
    await service.deleteMine(actor, context, address.publicId);

    expect(store.listMine).toHaveBeenCalledWith(11, 41, { page: 1, pageSize: 20 });
    expect(store.updateMine).toHaveBeenCalledWith(11, 41, address.publicId, { label: "会社" }, expect.objectContaining({ action: "customer_address.self_update" }));
    expect(store.deleteMine).toHaveBeenCalledWith(11, 41, address.publicId, expect.objectContaining({ action: "customer_address.self_delete" }));
  });

  it("rejects non-customer scope before repository access", async () => {
    const store = repository();
    const service = new CustomerAddressService(store, audit);
    await expect(service.listMine({ ...actor, currentIdentityType: "technician" }, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
    expect(store.listMine).not.toHaveBeenCalled();
  });

});
