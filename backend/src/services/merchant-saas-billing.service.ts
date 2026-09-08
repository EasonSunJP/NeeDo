import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type {
  CreateMerchantAccountBody,
  CreateSuspensionBody,
  DissolveMerchantBody,
  ExtendTrialBody,
  FreePeriodListQuery,
  InterruptTrialBody,
  LinkMerchantShopBody,
  ManualPaymentBody,
  MerchantAccountListQuery,
  ReleaseSuspensionBody,
  SaasInvoiceListQuery,
  UpdateBillingProfileBody,
  UpdatePaymentResponsibilityBody
} from "../validators/merchant-saas-billing.validator";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import {
  SaasBillingPolicyService,
  type BillingCadence,
  type BillingState,
  type FreeDuration,
  type InitialTrialFreePeriod,
  type TrialStatus
} from "./saas-billing-policy.service";

export type BillingSubjectType = "merchant_account" | "shop";
export type PaymentProviderType = "manual" | "stripe";
export const SHOP_PLATFORM_COMMISSION_RATE_PERCENT = 0;

export interface ShopCreatorPayload {
  userId: number;
  needoId: string;
  displayName: string;
  email: string;
}

export interface SaasFreePeriodRecord {
  id: number;
  periodType: string;
  startsAt: Date;
  endsAt: Date | null;
  extensionSequence: number | null;
  reason: string | null;
}

export interface SaasBillingProfileRecord {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  billingCadence: BillingCadence;
  monthlyFeeJpy: number;
  cadenceLocked: boolean;
  amountLocked: boolean;
  trialStatus: TrialStatus;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  trialUsedAt: Date | null;
  paidThrough: Date | null;
  paymentProvider: PaymentProviderType;
  version: number;
  freePeriods: SaasFreePeriodRecord[];
  activeTechnicians?: number;
}

export interface ActiveSuspensionRecord {
  id: number;
  scope: string;
  reasonCodes: string[];
  startsAt: Date;
}

export interface ShopAccountRecord {
  kind: "shop";
  id: number;
  name: string;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  ownerEmail: string | null;
  createdBy: ShopCreatorPayload | null;
  coverUrl: string | null;
  ratingAverage: number;
  reviewCount: number;
  technicianCount: number;
  createdAt: Date;
  billingProfile: SaasBillingProfileRecord | null;
  activeSuspension: ActiveSuspensionRecord | null;
}

export interface MerchantAccountAggregateRecord {
  kind: "merchant_group";
  id: number;
  code: string;
  name: string;
  status: string;
  paymentResponsibility: "group_consolidated" | "shops_individual";
  createdAt: Date;
  billingProfile: SaasBillingProfileRecord | null;
  activeSuspension: ActiveSuspensionRecord | null;
  shops: ShopAccountRecord[];
}

export type MerchantAccountListRecord = MerchantAccountAggregateRecord | ShopAccountRecord;

export interface SaasInvoiceLinePayload {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  description: string;
  monthlyFeeJpy: number;
  amountJpy: number;
  periodStartsAt: string;
  periodEndsAt: string;
}

export interface SaasPaymentPayload {
  id: number;
  provider: PaymentProviderType;
  externalReference: string | null;
  amountJpy: number;
  receivedAt: string;
  status: string;
  reviewedById: number | null;
  reviewedAt: string | null;
}

export interface SaasInvoicePayload {
  id: number;
  invoiceNo: string;
  payerType: BillingSubjectType;
  payerId: number;
  billingCadence: BillingCadence;
  periodStartsAt: string;
  periodEndsAt: string;
  dueAt: string;
  amountJpy: number;
  status: string;
  paymentProvider: PaymentProviderType;
  lines: SaasInvoiceLinePayload[];
  payments: SaasPaymentPayload[];
}

export interface BillingCardPayload {
  subjectType: BillingSubjectType;
  subjectId: number;
  cadence: BillingCadence;
  monthlyFeeJpy: number;
  annualFeeJpy: number;
  cadenceLocked: boolean;
  amountLocked: boolean;
  state: BillingState;
  trialStatus: TrialStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  paidThrough: string | null;
  paymentProvider: PaymentProviderType;
  freeDuration: FreeDuration | null;
  extensionCount: number;
  version: number;
}

export interface ShopBillingCardPayload {
  id: number;
  type: "single_shop" | "shop";
  name: string;
  city: string;
  address: string;
  phone: string | null;
  status: string;
  ownerEmail: string | null;
  createdBy: ShopCreatorPayload | null;
  platformCommissionRatePercent: number;
  coverUrl: string | null;
  ratingAverage: number;
  reviewCount: number;
  technicianCount: number;
  billing: BillingCardPayload;
  suspension: ActiveSuspensionPayload | null;
  createdAt: string;
}

export interface MerchantAccountCardPayload {
  id: number;
  type: "merchant_group";
  code: string;
  name: string;
  status: string;
  paymentResponsibility: "group_consolidated" | "shops_individual";
  billing: BillingCardPayload;
  suspension: ActiveSuspensionPayload | null;
  consolidatedMonthlyTotalJpy: number;
  shops: ShopBillingCardPayload[];
  createdAt: string;
}

export interface ActiveSuspensionPayload {
  id: number;
  scope: string;
  reasonCodes: string[];
  startsAt: string;
}

export type MerchantAccountCardListItem = MerchantAccountCardPayload | ShopBillingCardPayload;

export interface CreateMerchantAccountRepositoryInput extends CreateMerchantAccountBody {
  actorUserId: number;
  trialStartsAt: Date;
  trialEndsAt: Date;
  automaticBonusDays: number;
  freePeriods: InitialTrialFreePeriod[];
}

export interface UpdateBillingProfileRepositoryInput extends UpdateBillingProfileBody {
  subjectType: BillingSubjectType;
  subjectId: number;
  actorUserId: number;
  changedAt: Date;
}

export interface BillingReconciliationTransition {
  subjectType: BillingSubjectType;
  subjectId: number;
  action: "trial_started" | "trial_interrupted" | "trial_completed";
  occurredAt: Date;
}

export interface GeneratedInvoiceRecord {
  id: number;
  payerType: BillingSubjectType;
  payerId: number;
  billingCadence: Exclude<BillingCadence, "free">;
  periodStartsAt: Date;
  periodEndsAt: Date;
  amountJpy: number;
  lineCount: number;
}

export interface TrialExtensionRepositoryInput {
  subjectType: BillingSubjectType;
  subjectId: number;
  expectedVersion: number;
  expectedExtensionCount: number;
  endsAt: Date;
  addedMonths: number;
  addedDays: number;
  reason: string;
  actorUserId: number;
}

export interface ManualPaymentRepositoryInput extends ManualPaymentBody {
  invoiceId: number;
  actorUserId: number;
  provider: PaymentProviderType;
}

export interface SuspensionResultRecord {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  scope: CreateSuspensionBody["scope"];
  reasonCodes: string[];
  note: string;
  startsAt: Date;
  affectedShopIds: number[];
  detachedShopIds: number[];
  promotedAdminUserIds: number[];
}

export interface SuspensionReleaseRecord {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  releasedAt: Date;
}

export interface SuspensionResultPayload extends Omit<SuspensionResultRecord, "startsAt"> {
  startsAt: string;
}

export interface SuspensionReleasePayload extends Omit<SuspensionReleaseRecord, "releasedAt"> {
  releasedAt: string;
}

export interface MerchantDissolutionRecord {
  deleted: boolean;
  blockedShopIds: number[];
}

export interface ShopDissolutionRecord {
  deleted: boolean;
  activeOrderCount: number;
}

export interface MerchantSaasBillingRepositoryPort {
  listAccounts: (
    input: MerchantAccountListQuery
  ) => Promise<PaginatedResponse<MerchantAccountListRecord>>;
  getMerchantAccount: (id: number) => Promise<MerchantAccountAggregateRecord | null>;
  getShopAccount: (id: number) => Promise<ShopAccountRecord | null>;
  createMerchantAccount: (
    input: CreateMerchantAccountRepositoryInput
  ) => Promise<MerchantAccountAggregateRecord>;
  findBillingProfile: (
    subjectType: BillingSubjectType,
    subjectId: number
  ) => Promise<SaasBillingProfileRecord | null>;
  reconcileShopBillingProfiles: (input: {
    shopIds: number[];
    merchantAccountIds?: number[];
    now: Date;
    actorUserId: number;
  }) => Promise<BillingReconciliationTransition[]>;
  updateBillingProfile: (
    input: UpdateBillingProfileRepositoryInput
  ) => Promise<{ before: SaasBillingProfileRecord; after: SaasBillingProfileRecord } | null>;
  updatePaymentResponsibility: (
    merchantAccountId: number,
    input: UpdatePaymentResponsibilityBody,
    actorUserId: number
  ) => Promise<MerchantAccountAggregateRecord | null>;
  linkShop: (
    merchantAccountId: number,
    input: LinkMerchantShopBody,
    actorUserId: number
  ) => Promise<MerchantAccountAggregateRecord | null>;
  unlinkShop: (
    merchantAccountId: number,
    shopId: number,
    actorUserId: number
  ) => Promise<MerchantAccountAggregateRecord | null>;
  addTrialExtension: (
    input: TrialExtensionRepositoryInput
  ) => Promise<SaasBillingProfileRecord | null>;
  interruptTrial: (input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    expectedVersion: number;
    reason: string;
    actorUserId: number;
    interruptedAt: Date;
  }) => Promise<SaasBillingProfileRecord | null>;
  listFreePeriods: (
    subjectType: BillingSubjectType,
    subjectId: number,
    input: FreePeriodListQuery
  ) => Promise<PaginatedResponse<SaasFreePeriodRecord>>;
  listInvoices: (input: SaasInvoiceListQuery) => Promise<PaginatedResponse<SaasInvoicePayload>>;
  materializeDueInvoices: (input: { now: Date }) => Promise<GeneratedInvoiceRecord[]>;
  getInvoice: (id: number) => Promise<SaasInvoicePayload | null>;
  recordManualPayment: (input: ManualPaymentRepositoryInput) => Promise<SaasInvoicePayload | null>;
  createSuspension: (input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    reasonCodes: string[];
    note: string;
    scope: CreateSuspensionBody["scope"];
    actorUserId: number;
  }) => Promise<SuspensionResultRecord | null>;
  releaseSuspension: (input: {
    subjectType: BillingSubjectType;
    subjectId: number;
    suspensionId: number;
    reason: string;
    actorUserId: number;
  }) => Promise<SuspensionReleaseRecord | null>;
  softDeleteMerchant: (
    merchantAccountId: number,
    strategy: DissolveMerchantBody["strategy"],
    actorUserId: number
  ) => Promise<MerchantDissolutionRecord | null>;
  softDeleteShop: (shopId: number, actorUserId: number) => Promise<ShopDissolutionRecord | null>;
}

export interface PaymentProviderResult {
  provider: PaymentProviderType;
  reference: string;
  status: "confirmed";
}

export interface PaymentProvider {
  readonly type: PaymentProviderType;
  prepareReview: (input: ManualPaymentBody) => Promise<PaymentProviderResult>;
}

export class ManualReviewPaymentProvider implements PaymentProvider {
  public readonly type = "manual" as const;

  public async prepareReview(input: ManualPaymentBody): Promise<PaymentProviderResult> {
    return {
      provider: this.type,
      reference: input.reference,
      status: "confirmed"
    };
  }
}

type AuditRecorder = Pick<AuditLogService, "record">;

export class MerchantSaasBillingService {
  public constructor(
    private readonly repository: MerchantSaasBillingRepositoryPort,
    private readonly auditLogService: AuditRecorder,
    private readonly policy: SaasBillingPolicyService = new SaasBillingPolicyService(),
    private readonly paymentProvider: PaymentProvider = new ManualReviewPaymentProvider(),
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listAccounts(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: MerchantAccountListQuery
  ): Promise<PaginatedResponse<MerchantAccountCardListItem>> {
    let page = await this.repository.listAccounts(input);
    const transitions = await this.repository.reconcileShopBillingProfiles({
      shopIds: this.shopIdsFromAccounts(page.list),
      merchantAccountIds: page.list.flatMap((record) =>
        record.kind === "merchant_group" ? [record.id] : []
      ),
      now: this.now(),
      actorUserId: actor.userId
    });
    if (transitions.length > 0) {
      page = await this.repository.listAccounts(input);
      await this.recordReconciliationTransitions(actor, context, transitions);
    }
    await this.record(actor, context, "backoffice.merchant_accounts.list", "merchant_account");

    return { ...page, list: page.list.map((record) => this.mapAccount(record)) };
  }

  public async getMerchantAccount(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number
  ): Promise<MerchantAccountCardPayload> {
    let record = await this.repository.getMerchantAccount(id);

    if (!record) {
      throw this.notFound("error.merchant_account.not_found");
    }

    const transitions = await this.repository.reconcileShopBillingProfiles({
      shopIds: record.shops.map((shop) => shop.id),
      merchantAccountIds: [record.id],
      now: this.now(),
      actorUserId: actor.userId
    });
    if (transitions.length > 0) {
      record = await this.repository.getMerchantAccount(id);
      if (!record) {
        throw this.notFound("error.merchant_account.not_found");
      }
      await this.recordReconciliationTransitions(actor, context, transitions);
    }

    await this.record(actor, context, "backoffice.merchant_accounts.read", "merchant_account", id);
    return this.mapMerchant(record);
  }

  public async getShopAccount(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number
  ): Promise<ShopBillingCardPayload> {
    let record = await this.repository.getShopAccount(id);
    if (!record) {
      throw this.notFound("error.shop.not_found");
    }

    const transitions = await this.repository.reconcileShopBillingProfiles({
      shopIds: [id],
      now: this.now(),
      actorUserId: actor.userId
    });
    if (transitions.length > 0) {
      record = await this.repository.getShopAccount(id);
      if (!record) {
        throw this.notFound("error.shop.not_found");
      }
      await this.recordReconciliationTransitions(actor, context, transitions);
    }

    await this.record(actor, context, "backoffice.shop_saas_account.read", "shop", id);
    return this.mapShop(record);
  }

  public async createMerchantAccount(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: CreateMerchantAccountBody
  ): Promise<MerchantAccountCardPayload> {
    const trial = this.policy.calculateInitialTrial(this.now());
    const freePeriods = this.policy.buildInitialTrialFreePeriods(trial);
    const record = await this.repository.createMerchantAccount({
      ...input,
      actorUserId: actor.userId,
      trialStartsAt: trial.startsAt,
      trialEndsAt: trial.endsAt,
      automaticBonusDays: trial.automaticBonusDays,
      freePeriods
    });
    await this.record(
      actor,
      context,
      "backoffice.merchant_accounts.create",
      "merchant_account",
      record.id,
      {
        paymentResponsibility: input.paymentResponsibility,
        trialStartsAt: trial.startsAt.toISOString(),
        trialEndsAt: trial.endsAt.toISOString(),
        automaticBonusDays: trial.automaticBonusDays
      }
    );

    return this.mapMerchant(record);
  }

  public async updateBillingProfile(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    input: UpdateBillingProfileBody
  ): Promise<BillingCardPayload> {
    const current = await this.getProfile(subjectType, subjectId);
    if (
      subjectType === "shop" &&
      (current.activeTechnicians ?? 0) <= 1 &&
      (input.cadenceLocked || input.amountLocked)
    ) {
      throw this.conflict("error.saas_billing.single_shop_lock_forbidden");
    }
    const result = await this.repository.updateBillingProfile({
      ...input,
      subjectType,
      subjectId,
      actorUserId: actor.userId,
      changedAt: this.now()
    });

    if (!result) {
      throw this.conflict("error.saas_billing.profile_version_conflict");
    }

    await this.record(
      actor,
      context,
      "backoffice.saas_billing.profile.update",
      subjectType === "merchant_account" ? "merchant_account" : "shop",
      subjectId,
      { before: this.auditProfile(result.before), after: this.auditProfile(result.after) }
    );
    return this.mapBilling(result.after);
  }

  public async updatePaymentResponsibility(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number,
    input: UpdatePaymentResponsibilityBody
  ): Promise<MerchantAccountCardPayload> {
    const record = await this.repository.updatePaymentResponsibility(id, input, actor.userId);

    if (!record) {
      throw this.notFound("error.merchant_account.not_found");
    }

    await this.record(
      actor,
      context,
      "backoffice.merchant_accounts.payment_responsibility.update",
      "merchant_account",
      id,
      {
        paymentResponsibility: input.paymentResponsibility,
        effectiveFrom: input.effectiveFrom?.toISOString() ?? null
      }
    );
    return this.mapMerchant(record);
  }

  public async linkShop(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number,
    input: LinkMerchantShopBody
  ): Promise<MerchantAccountCardPayload> {
    const record = await this.repository.linkShop(id, input, actor.userId);

    if (!record) {
      throw this.conflict("error.merchant_account.shop_link_conflict");
    }

    await this.record(
      actor,
      context,
      "backoffice.merchant_accounts.shop.link",
      "merchant_account",
      id,
      {
        shopId: input.shopId
      }
    );
    return this.mapMerchant(record);
  }

  public async unlinkShop(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number,
    shopId: number
  ): Promise<MerchantAccountCardPayload> {
    const record = await this.repository.unlinkShop(id, shopId, actor.userId);

    if (!record) {
      throw this.notFound("error.merchant_account.membership_not_found");
    }

    await this.record(
      actor,
      context,
      "backoffice.merchant_accounts.shop.unlink",
      "merchant_account",
      id,
      { shopId }
    );
    return this.mapMerchant(record);
  }

  public async extendTrial(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    input: ExtendTrialBody
  ): Promise<BillingCardPayload> {
    const profile = await this.getProfile(subjectType, subjectId);

    if (
      profile.trialStatus !== "active" ||
      !profile.trialEndsAt ||
      profile.trialEndsAt.getTime() <= this.now().getTime()
    ) {
      throw this.conflict("error.saas_billing.trial_not_active");
    }

    const extensionCount = profile.freePeriods.filter(
      (period) => period.periodType === "admin_extension"
    ).length;
    const paidFrom =
      input.paidFrom ??
      (input.days
        ? new Date(profile.trialEndsAt.getTime() + input.days * 24 * 60 * 60 * 1000)
        : undefined);
    const extension = this.runPolicy(() =>
      this.policy.calculateExtension({
        currentEndsAt: profile.trialEndsAt!,
        extensionCount,
        quickMonths: paidFrom ? undefined : input.quickMonths,
        paidFrom
      })
    );
    const updated = await this.repository.addTrialExtension({
      subjectType,
      subjectId,
      expectedVersion: input.version,
      expectedExtensionCount: extensionCount,
      endsAt: extension.endsAt,
      addedMonths: extension.addedMonths,
      addedDays: extension.addedDays,
      reason: input.reason,
      actorUserId: actor.userId
    });

    if (!updated) {
      throw this.conflict("error.saas_billing.profile_version_conflict");
    }

    await this.record(
      actor,
      context,
      "backoffice.saas_billing.trial.extend",
      subjectType,
      subjectId,
      {
        extensionSequence: extension.extensionCount,
        addedMonths: extension.addedMonths,
        addedDays: extension.addedDays,
        paidFrom: extension.paidFrom.toISOString()
      }
    );
    return this.mapBilling(updated);
  }

  public async interruptTrial(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    input: InterruptTrialBody
  ): Promise<BillingCardPayload> {
    const current = await this.getProfile(subjectType, subjectId);
    const interruptedAt = this.now();
    if (
      current.trialStatus !== "active" ||
      !current.trialEndsAt ||
      current.trialEndsAt.getTime() <= interruptedAt.getTime()
    ) {
      throw this.conflict("error.saas_billing.trial_not_active");
    }
    const updated = await this.repository.interruptTrial({
      subjectType,
      subjectId,
      expectedVersion: input.version,
      reason: input.reason,
      actorUserId: actor.userId,
      interruptedAt
    });

    if (!updated) {
      throw this.conflict("error.saas_billing.trial_interrupt_conflict");
    }

    await this.record(
      actor,
      context,
      "backoffice.saas_billing.trial.interrupt",
      subjectType,
      subjectId,
      {
        reason: input.reason
      }
    );
    return this.mapBilling(updated);
  }

  public async listFreePeriods(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    input: FreePeriodListQuery
  ): Promise<PaginatedResponse<SaasFreePeriodRecord>> {
    const periods = await this.repository.listFreePeriods(subjectType, subjectId, input);
    await this.record(
      actor,
      context,
      "backoffice.saas_billing.free_periods.list",
      subjectType,
      subjectId
    );
    return periods;
  }

  public async listInvoices(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: SaasInvoiceListQuery
  ): Promise<PaginatedResponse<SaasInvoicePayload>> {
    const generated = await this.repository.materializeDueInvoices({ now: this.now() });
    for (const invoice of generated) {
      await this.record(
        actor,
        context,
        "backoffice.saas_invoice.generate",
        "saas_invoice",
        invoice.id,
        {
          payerType: invoice.payerType,
          payerId: invoice.payerId,
          billingCadence: invoice.billingCadence,
          periodStartsAt: invoice.periodStartsAt.toISOString(),
          periodEndsAt: invoice.periodEndsAt.toISOString(),
          amountJpy: invoice.amountJpy,
          lineCount: invoice.lineCount
        }
      );
    }
    const invoices = await this.repository.listInvoices(input);
    await this.record(actor, context, "backoffice.saas_invoices.list", "saas_invoice");
    return invoices;
  }

  public async getInvoice(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    id: number
  ): Promise<SaasInvoicePayload> {
    const invoice = await this.repository.getInvoice(id);

    if (!invoice) {
      throw this.notFound("error.saas_invoice.not_found");
    }

    await this.record(actor, context, "backoffice.saas_invoices.read", "saas_invoice", id);
    return invoice;
  }

  public async reviewManualPayment(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    invoiceId: number,
    input: ManualPaymentBody
  ): Promise<SaasInvoicePayload> {
    const providerResult = await this.paymentProvider.prepareReview(input);
    const invoice = await this.repository.recordManualPayment({
      ...input,
      invoiceId,
      actorUserId: actor.userId,
      provider: providerResult.provider
    });

    if (!invoice) {
      throw new AppError({
        code: ERROR_CODES.SAAS_PAYMENT_CONFLICT,
        message: "error.saas_payment.review_conflict",
        statusCode: 409
      });
    }

    await this.record(actor, context, "backoffice.saas_payment.review", "saas_invoice", invoiceId, {
      amountJpy: input.amountJpy,
      receivedAt: input.receivedAt.toISOString(),
      provider: providerResult.provider,
      reference: providerResult.reference,
      idempotencyKey: input.idempotencyKey
    });
    return invoice;
  }

  public async createSuspension(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    input: CreateSuspensionBody
  ): Promise<SuspensionResultPayload> {
    const validScope =
      (subjectType === "shop" && input.scope === "subject_only") ||
      (subjectType === "merchant_account" &&
        ["merchant_and_shops", "merchant_detach_shops"].includes(input.scope));

    if (!validScope) {
      throw this.conflict("error.entity_suspension.invalid_scope");
    }

    const result = await this.repository.createSuspension({
      subjectType,
      subjectId,
      reasonCodes: Array.from(new Set(input.reasonCodes)),
      note: input.note,
      scope: input.scope,
      actorUserId: actor.userId
    });

    if (!result) {
      throw this.conflict("error.entity_suspension.create_conflict");
    }

    await this.record(
      actor,
      context,
      "backoffice.entity_suspension.create",
      subjectType === "merchant_account" ? "merchant_account" : "shop",
      subjectId,
      {
        suspensionId: result.id,
        scope: result.scope,
        reasonCodes: result.reasonCodes,
        affectedShopIds: result.affectedShopIds,
        detachedShopIds: result.detachedShopIds,
        promotedAdminUserIds: result.promotedAdminUserIds,
        loginDisabled: false,
        existingBookingsCancelled: false
      }
    );

    return { ...result, startsAt: result.startsAt.toISOString() };
  }

  public async releaseSuspension(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    subjectType: BillingSubjectType,
    subjectId: number,
    suspensionId: number,
    input: ReleaseSuspensionBody
  ): Promise<SuspensionReleasePayload> {
    const result = await this.repository.releaseSuspension({
      subjectType,
      subjectId,
      suspensionId,
      reason: input.reason,
      actorUserId: actor.userId
    });

    if (!result) {
      throw this.notFound("error.entity_suspension.not_found");
    }

    await this.record(
      actor,
      context,
      "backoffice.entity_suspension.release",
      subjectType === "merchant_account" ? "merchant_account" : "shop",
      subjectId,
      {
        suspensionId,
        reason: input.reason,
        blockedAvailabilityRestored: false
      }
    );
    return { ...result, releasedAt: result.releasedAt.toISOString() };
  }

  public async dissolveMerchant(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    merchantAccountId: number,
    input: DissolveMerchantBody
  ): Promise<{ deleted: true }> {
    const result = await this.repository.softDeleteMerchant(
      merchantAccountId,
      input.strategy,
      actor.userId
    );

    if (!result) {
      throw this.notFound("error.merchant_account.not_found");
    }
    if (!result.deleted) {
      throw this.conflict("error.entity_dissolution.active_orders");
    }

    await this.record(
      actor,
      context,
      "backoffice.entity_dissolution.merchant",
      "merchant_account",
      merchantAccountId,
      { strategy: input.strategy, blockedShopIds: result.blockedShopIds }
    );
    return { deleted: true };
  }

  public async dissolveShop(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    shopId: number
  ): Promise<{ deleted: true }> {
    const result = await this.repository.softDeleteShop(shopId, actor.userId);

    if (!result) {
      throw this.notFound("error.shop.not_found");
    }
    if (!result.deleted) {
      throw this.conflict("error.entity_dissolution.active_orders");
    }

    await this.record(actor, context, "backoffice.entity_dissolution.shop", "shop", shopId, {
      activeOrderCount: result.activeOrderCount
    });
    return { deleted: true };
  }

  private async getProfile(
    subjectType: BillingSubjectType,
    subjectId: number
  ): Promise<SaasBillingProfileRecord> {
    const profile = await this.repository.findBillingProfile(subjectType, subjectId);

    if (!profile) {
      throw this.notFound("error.saas_billing.profile_not_found");
    }

    return profile;
  }

  private mapAccount(record: MerchantAccountListRecord): MerchantAccountCardListItem {
    return record.kind === "merchant_group" ? this.mapMerchant(record) : this.mapShop(record);
  }

  private mapMerchant(record: MerchantAccountAggregateRecord): MerchantAccountCardPayload {
    const shops = record.shops.map((shop) => this.mapShop(shop));
    const billing = this.mapBilling(record.billingProfile, "merchant_account", record.id);
    const consolidatedMonthlyTotalJpy =
      (billing.cadence === "free" ? 0 : billing.monthlyFeeJpy) +
      shops.reduce(
        (total, shop) =>
          total +
          (shop.type === "shop" && shop.billing.cadence !== "free"
            ? shop.billing.monthlyFeeJpy
            : 0),
        0
      );

    return {
      id: record.id,
      type: "merchant_group",
      code: record.code,
      name: record.name,
      status: record.status,
      paymentResponsibility: record.paymentResponsibility,
      billing,
      suspension: this.mapSuspension(record.activeSuspension),
      consolidatedMonthlyTotalJpy,
      shops,
      createdAt: record.createdAt.toISOString()
    };
  }

  private mapShop(record: ShopAccountRecord): ShopBillingCardPayload {
    const classification = this.policy.classifyShop(record.technicianCount);
    return {
      id: record.id,
      type: classification.type,
      name: record.name,
      city: record.city,
      address: record.address,
      phone: record.phone,
      status: record.status,
      ownerEmail: record.ownerEmail,
      createdBy: record.createdBy,
      platformCommissionRatePercent: SHOP_PLATFORM_COMMISSION_RATE_PERCENT,
      coverUrl: record.coverUrl,
      ratingAverage: record.ratingAverage,
      reviewCount: record.reviewCount,
      technicianCount: record.technicianCount,
      billing: this.mapBilling(record.billingProfile, "shop", record.id, record.technicianCount),
      suspension: this.mapSuspension(record.activeSuspension),
      createdAt: record.createdAt.toISOString()
    };
  }

  private mapBilling(
    profile: SaasBillingProfileRecord | null,
    fallbackSubjectType?: BillingSubjectType,
    fallbackSubjectId?: number,
    activeTechnicians?: number
  ): BillingCardPayload {
    const subjectType = profile?.subjectType ?? fallbackSubjectType ?? "shop";
    const subjectId = profile?.subjectId ?? fallbackSubjectId ?? 0;
    const monthlyFeeJpy = profile?.monthlyFeeJpy ?? 9800;
    const freePeriods = profile?.freePeriods ?? [];
    const technicianCount = activeTechnicians ?? profile?.activeTechnicians;
    const cadence = profile?.billingCadence ?? "monthly";
    const trialStatus = profile?.trialStatus ?? "not_started";
    const state = this.policy.resolveState(
      {
        subjectType: subjectType === "merchant_account" ? "merchant_group" : "shop",
        activeTechnicians: technicianCount,
        billingCadence: cadence,
        trialStatus,
        trialEndsAt: profile?.trialEndsAt ?? null,
        paidThrough: profile?.paidThrough ?? null
      },
      this.now()
    );
    const isSingleShop =
      subjectType === "shop" && this.policy.classifyShop(technicianCount ?? 0).billable === false;

    return {
      subjectType,
      subjectId,
      cadence: isSingleShop ? "free" : cadence,
      monthlyFeeJpy,
      annualFeeJpy: this.policy.calculateAnnualFee(monthlyFeeJpy),
      cadenceLocked: profile?.cadenceLocked ?? false,
      amountLocked: profile?.amountLocked ?? false,
      state,
      trialStatus: isSingleShop ? "not_applicable" : trialStatus,
      trialStartedAt: profile?.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: profile?.trialEndsAt?.toISOString() ?? null,
      paidThrough: profile?.paidThrough?.toISOString() ?? null,
      paymentProvider: profile?.paymentProvider ?? "manual",
      freeDuration: isSingleShop
        ? null
        : this.policy.formatFreeDuration(
            freePeriods.map((period) => ({
              startsAt: period.startsAt,
              endsAt: period.endsAt ?? this.now()
            }))
          ),
      extensionCount: freePeriods.filter((period) => period.periodType === "admin_extension")
        .length,
      version: profile?.version ?? 0
    };
  }

  private mapSuspension(record: ActiveSuspensionRecord | null): ActiveSuspensionPayload | null {
    return record
      ? {
          id: record.id,
          scope: record.scope,
          reasonCodes: record.reasonCodes,
          startsAt: record.startsAt.toISOString()
        }
      : null;
  }

  private shopIdsFromAccounts(records: MerchantAccountListRecord[]): number[] {
    return Array.from(
      new Set(
        records.flatMap((record) =>
          record.kind === "merchant_group" ? record.shops.map((shop) => shop.id) : [record.id]
        )
      )
    );
  }

  private async recordReconciliationTransitions(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    transitions: BillingReconciliationTransition[]
  ): Promise<void> {
    for (const transition of transitions) {
      await this.record(
        actor,
        context,
        `backoffice.saas_billing.${transition.action}`,
        transition.subjectType === "merchant_account" ? "merchant_account" : "shop",
        transition.subjectId,
        {
          occurredAt: transition.occurredAt.toISOString(),
          source: "technician_count_reconciliation"
        }
      );
    }
  }

  private auditProfile(profile: SaasBillingProfileRecord): Record<string, unknown> {
    return {
      billingCadence: profile.billingCadence,
      monthlyFeeJpy: profile.monthlyFeeJpy,
      cadenceLocked: profile.cadenceLocked,
      amountLocked: profile.amountLocked,
      paymentProvider: profile.paymentProvider,
      version: profile.version
    };
  }

  private runPolicy<TResult>(callback: () => TResult): TResult {
    try {
      return callback();
    } catch (error) {
      throw this.conflict(error instanceof Error ? error.message : "error.saas_billing.conflict");
    }
  }

  private record(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    action: string,
    targetType: string,
    targetId?: number,
    metadata?: unknown
  ): Promise<void> {
    return this.auditLogService.record({
      actor,
      context,
      action,
      targetType,
      targetId: targetId ?? null,
      metadata
    });
  }

  private notFound(message: string): AppError {
    return new AppError({ code: ERROR_CODES.NOT_FOUND, message, statusCode: 404 });
  }

  private conflict(message: string): AppError {
    return new AppError({
      code: ERROR_CODES.SAAS_BILLING_CONFLICT,
      message,
      statusCode: 409
    });
  }
}
