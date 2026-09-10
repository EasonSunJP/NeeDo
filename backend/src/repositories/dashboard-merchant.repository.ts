import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardAggregateInput, DashboardMerchantFacts } from "../domain/dashboard";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;
type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;

interface MerchantSnapshotRow {
  publicId?: string;
  public_id?: string;
  name: string;
  city: string;
  address: string;
  status: string;
  activeTechnicianCount?: NumericValue;
  active_technician_count?: NumericValue;
  billingProfileId?: NumericValue;
  billing_profile_id?: NumericValue;
  billingCadence?: string | null;
  billing_cadence?: string | null;
  trialStatus?: string | null;
  trial_status?: string | null;
  trialEndsAt?: Date | string | null;
  trial_ends_at?: Date | string | null;
  paidThrough?: Date | string | null;
  paid_through?: Date | string | null;
  walletId?: NumericValue;
  wallet_id?: NumericValue;
  walletAvailableBalance?: NumericValue;
  wallet_available_balance?: NumericValue;
  walletFrozenBalance?: NumericValue;
  wallet_frozen_balance?: NumericValue;
}

export interface DashboardMerchantReader {
  getMerchantFacts(input: DashboardAggregateInput): Promise<DashboardMerchantFacts | null>;
}

export class DashboardMerchantRepository implements DashboardMerchantReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getMerchantFacts(
    input: DashboardAggregateInput
  ): Promise<DashboardMerchantFacts | null> {
    if (input.scope.kind !== "shop") return null;

    const [row] = await this.queryMerchantSnapshot(input.scope.shopId);
    const publicId = row?.publicId ?? row?.public_id;
    if (!row || !publicId) return null;

    const billingProfileId = row.billingProfileId ?? row.billing_profile_id;
    const walletId = row.walletId ?? row.wallet_id;
    return {
      publicId,
      name: row.name,
      city: row.city,
      address: row.address,
      status: row.status,
      activeTechnicianCount: this.toNumber(
        row.activeTechnicianCount ?? row.active_technician_count
      ),
      billing:
        billingProfileId === null || billingProfileId === undefined
          ? null
          : {
              cadence: this.billingCadence(row.billingCadence ?? row.billing_cadence),
              trialStatus: this.trialStatus(row.trialStatus ?? row.trial_status),
              trialEndsAt: this.dateValue(row.trialEndsAt ?? row.trial_ends_at),
              paidThrough: this.dateValue(row.paidThrough ?? row.paid_through)
            },
      wallet:
        walletId === null || walletId === undefined
          ? null
          : {
              currency: "NDP",
              availableBalance: this.toNumber(
                row.walletAvailableBalance ?? row.wallet_available_balance
              ),
              frozenBalance: this.toNumber(row.walletFrozenBalance ?? row.wallet_frozen_balance)
            }
    };
  }

  private async queryMerchantSnapshot(shopId: number): Promise<MerchantSnapshotRow[]> {
    return this.client.$queryRaw<MerchantSnapshotRow[]>(Prisma.sql`
      /* dashboard_merchant_shop_snapshot */
      SELECT
        identifier.public_id AS publicId,
        shop.name,
        shop.city,
        shop.address,
        shop.status,
        COALESCE(active_technician.aggregate_value, 0) AS activeTechnicianCount,
        billing.id AS billingProfileId,
        billing.billing_cadence AS billingCadence,
        billing.trial_status AS trialStatus,
        billing.trial_ends_at AS trialEndsAt,
        billing.paid_through AS paidThrough,
        wallet.id AS walletId,
        wallet.available_balance AS walletAvailableBalance,
        wallet.frozen_balance AS walletFrozenBalance
      FROM shops AS shop
      INNER JOIN public_identifiers AS identifier
        ON identifier.shop_id = shop.id
        AND identifier.kind = ${"shop"}
        AND identifier.status = ${"active"}
        AND identifier.deleted_at IS NULL
      LEFT JOIN saas_billing_profiles AS billing
        ON billing.subject_type = ${"shop"}
        AND billing.subject_id = shop.id
        AND billing.shop_id = shop.id
        AND billing.active_key IS NOT NULL
        AND billing.deleted_at IS NULL
      LEFT JOIN (
        SELECT profile.shop_id, COUNT(profile.id) AS aggregate_value
        FROM technician_profiles AS profile
        WHERE profile.status = ${"published"}
          AND profile.deleted_at IS NULL
        GROUP BY profile.shop_id
      ) AS active_technician ON active_technician.shop_id = shop.id
      LEFT JOIN wallets AS wallet
        ON wallet.owner_type = ${"shop"}
        AND wallet.owner_id = shop.id
        AND wallet.currency = ${"NDP"}
        AND wallet.deleted_at IS NULL
      WHERE shop.id = ${shopId}
        AND shop.deleted_at IS NULL
      LIMIT 1
    `);
  }

  private billingCadence(value: string | null | undefined): "monthly" | "annual" | "free" {
    return value === "annual" || value === "free" ? value : "monthly";
  }

  private trialStatus(
    value: string | null | undefined
  ): "not_started" | "active" | "completed" | "interrupted" | "not_applicable" {
    return value === "active" ||
      value === "completed" ||
      value === "interrupted" ||
      value === "not_applicable"
      ? value
      : "not_started";
  }

  private dateValue(value: Date | string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    return value instanceof Date ? value : new Date(value);
  }

  private toNumber(value: NumericValue): number {
    if (value === null || value === undefined) return 0;
    return Number(typeof value === "object" ? value.toString() : value);
  }
}
