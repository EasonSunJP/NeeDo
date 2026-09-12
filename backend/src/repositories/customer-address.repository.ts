import type { CustomerAddress, Prisma, PrismaClient } from "@prisma/client";
import { ERROR_CODES } from "../constants/error-codes";
import { prisma } from "../prisma/client";
import { AppError } from "../utils/app-error";
import { toAuditLogCreateData, type AuditLogCreateInput } from "./audit-log.repository";

export interface CustomerAddressPayload {
  id: number;
  publicId: string;
  label: string;
  countryCode: "JP";
  postalCode: string;
  admin1Code: string;
  prefecture: string;
  admin2Code: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  building: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerAddressMutation {
  label?: string;
  countryCode?: "JP";
  postalCode?: string;
  admin1Code?: string;
  prefecture?: string;
  admin2Code?: string;
  city?: string;
  addressLine1?: string;
  addressLine2?: string | null;
  building?: string | null;
  isDefault?: true;
}

export interface CustomerAddressCreateMutation extends Required<Omit<CustomerAddressMutation, "addressLine2" | "building" | "isDefault">> {
  addressLine2: string | null;
  building: string | null;
  isDefault?: boolean;
}

export interface CustomerAddressPage {
  list: CustomerAddressPayload[];
  total: number;
  page: number;
  page_size: number;
}

export interface CustomerAddressRepositoryPort {
  listMine: (userId: number, customerProfileId: number, query: { page: number; pageSize: number }) => Promise<CustomerAddressPage>;
  createMine: (userId: number, customerProfileId: number, input: CustomerAddressCreateMutation, auditLog: AuditLogCreateInput) => Promise<CustomerAddressPayload>;
  updateMine: (userId: number, customerProfileId: number, publicId: string, input: CustomerAddressMutation, auditLog: AuditLogCreateInput) => Promise<CustomerAddressPayload>;
  deleteMine: (userId: number, customerProfileId: number, publicId: string, auditLog: AuditLogCreateInput) => Promise<void>;
}

export class CustomerAddressRepository implements CustomerAddressRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async listMine(userId: number, customerProfileId: number, query: { page: number; pageSize: number }): Promise<CustomerAddressPage> {
    const where: Prisma.CustomerAddressWhereInput = {
      customerProfileId,
      customerProfile: { userId, deletedAt: null },
      deletedAt: null
    };
    const [list, total] = await this.client.$transaction([
      this.client.customerAddress.findMany({
        where,
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.client.customerAddress.count({ where })
    ]);
    return { list: list.map((record) => this.map(record)), total, page: query.page, page_size: query.pageSize };
  }

  public async createMine(userId: number, customerProfileId: number, input: CustomerAddressCreateMutation, auditLog: AuditLogCreateInput): Promise<CustomerAddressPayload> {
    const created = await this.client.$transaction(async (transaction) => {
      await this.requireProfile(transaction, userId, customerProfileId);
      const activeCount = await transaction.customerAddress.count({ where: { customerProfileId, deletedAt: null } });
      const isDefault = input.isDefault === true || activeCount === 0;
      if (isDefault) await this.clearDefault(transaction, customerProfileId);
      const record = await transaction.customerAddress.create({
        data: {
          customerProfileId,
          label: input.label,
          countryCode: input.countryCode,
          postalCode: input.postalCode,
          admin1Code: input.admin1Code,
          prefecture: input.prefecture,
          admin2Code: input.admin2Code,
          city: input.city,
          addressLine1: input.addressLine1,
          addressLine2: input.addressLine2,
          building: input.building,
          isDefault,
          defaultProfileKey: isDefault ? this.defaultKey(customerProfileId) : null
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...auditLog, targetId: record.id }) });
      return record;
    });
    return this.map(created);
  }

  public async updateMine(userId: number, customerProfileId: number, publicId: string, input: CustomerAddressMutation, auditLog: AuditLogCreateInput): Promise<CustomerAddressPayload> {
    const updated = await this.client.$transaction(async (transaction) => {
      const current = await this.requireAddress(transaction, userId, customerProfileId, publicId);
      if (input.isDefault === true && !current.isDefault) await this.clearDefault(transaction, customerProfileId);
      const record = await transaction.customerAddress.update({
        where: { id: current.id },
        data: {
          ...(input.label !== undefined ? { label: input.label } : {}),
          ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
          ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
          ...(input.admin1Code !== undefined ? { admin1Code: input.admin1Code } : {}),
          ...(input.prefecture !== undefined ? { prefecture: input.prefecture } : {}),
          ...(input.admin2Code !== undefined ? { admin2Code: input.admin2Code } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
          ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
          ...(input.building !== undefined ? { building: input.building } : {}),
          ...(input.isDefault === true ? { isDefault: true, defaultProfileKey: this.defaultKey(customerProfileId) } : {})
        }
      });
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...auditLog, targetId: record.id }) });
      return record;
    });
    return this.map(updated);
  }

  public async deleteMine(userId: number, customerProfileId: number, publicId: string, auditLog: AuditLogCreateInput): Promise<void> {
    await this.client.$transaction(async (transaction) => {
      const current = await this.requireAddress(transaction, userId, customerProfileId, publicId);
      await transaction.customerAddress.update({
        where: { id: current.id },
        data: { deletedAt: new Date(), isDefault: false, defaultProfileKey: null }
      });
      if (current.isDefault) {
        const replacement = await transaction.customerAddress.findFirst({
          where: { customerProfileId, deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
        });
        if (replacement) {
          await transaction.customerAddress.update({
            where: { id: replacement.id },
            data: { isDefault: true, defaultProfileKey: this.defaultKey(customerProfileId) }
          });
        }
      }
      await transaction.auditLog.create({ data: toAuditLogCreateData({ ...auditLog, targetId: current.id }) });
    });
  }

  private async requireProfile(transaction: Prisma.TransactionClient, userId: number, customerProfileId: number): Promise<void> {
    const profile = await transaction.customerProfile.findFirst({ where: { id: customerProfileId, userId, deletedAt: null }, select: { id: true } });
    if (!profile) throw this.notFound();
  }

  private async requireAddress(transaction: Prisma.TransactionClient, userId: number, customerProfileId: number, publicId: string): Promise<CustomerAddress> {
    const address = await transaction.customerAddress.findFirst({
      where: { publicId, customerProfileId, customerProfile: { userId, deletedAt: null }, deletedAt: null }
    });
    if (!address) throw this.notFound();
    return address;
  }

  private async clearDefault(transaction: Prisma.TransactionClient, customerProfileId: number): Promise<void> {
    await transaction.customerAddress.updateMany({
      where: { customerProfileId, deletedAt: null, isDefault: true },
      data: { isDefault: false, defaultProfileKey: null }
    });
  }

  private defaultKey(customerProfileId: number): string {
    return `customer-profile:${customerProfileId}`;
  }

  private map(record: CustomerAddress): CustomerAddressPayload {
    if (record.countryCode !== "JP") throw new AppError({ code: ERROR_CODES.INTERNAL, message: "error.customer_address.country_invalid", statusCode: 500 });
    return {
      id: record.id,
      publicId: record.publicId,
      label: record.label,
      countryCode: "JP",
      postalCode: record.postalCode,
      admin1Code: record.admin1Code,
      prefecture: record.prefecture,
      admin2Code: record.admin2Code,
      city: record.city,
      addressLine1: record.addressLine1,
      addressLine2: record.addressLine2,
      building: record.building,
      isDefault: record.isDefault,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  private notFound(): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message: "error.customer_address.not_found", statusCode: 404 });
  }
}
