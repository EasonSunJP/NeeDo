import type { DashboardMerchantFacts, DashboardMerchantSnapshot } from "../domain/dashboard";
import { SaasBillingPolicyService } from "./saas-billing-policy.service";

export class DashboardMerchantSnapshotService {
  public constructor(
    private readonly billingPolicy: SaasBillingPolicyService = new SaasBillingPolicyService(),
    private readonly now: () => Date = () => new Date()
  ) {}

  public compose(facts: DashboardMerchantFacts | null): DashboardMerchantSnapshot | null {
    if (!facts) return null;

    const billing = facts.billing
      ? {
          cadence: this.billingPolicy.classifyShop(facts.activeTechnicianCount).billable
            ? facts.billing.cadence
            : ("free" as const),
          state: this.billingPolicy.resolveState(
            {
              subjectType: "shop",
              activeTechnicians: facts.activeTechnicianCount,
              billingCadence: facts.billing.cadence,
              trialStatus: facts.billing.trialStatus,
              trialEndsAt: facts.billing.trialEndsAt,
              paidThrough: facts.billing.paidThrough
            },
            this.now()
          ),
          trialEndsAt: facts.billing.trialEndsAt?.toISOString() ?? null,
          paidThrough: facts.billing.paidThrough?.toISOString() ?? null
        }
      : null;

    return {
      publicId: facts.publicId,
      name: facts.name,
      city: facts.city,
      address: facts.address,
      status: facts.status,
      billing,
      wallet: facts.wallet
        ? {
            status: "available",
            currency: "NDP",
            availableBalance: facts.wallet.availableBalance,
            frozenBalance: facts.wallet.frozenBalance
          }
        : {
            status: "not_opened",
            currency: "NDP",
            availableBalance: null,
            frozenBalance: null
          }
    };
  }
}
