import { ERROR_CODES } from "../src/constants/error-codes";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  AffiliateTaskService,
  type AffiliateBudgetLedgerPort,
  type AffiliateBudgetReservationRecord,
  type AffiliateServiceScopeRecord,
  type AffiliateShopScopeRecord,
  type AffiliateTaskPersistenceInput,
  type AffiliateTaskRecord,
  type AffiliateTaskRepositoryPort,
  type AffiliateTaskTransactionClient,
  type CreateAffiliateTaskInput,
  type UpdateAffiliateTaskPersistenceInput
} from "../src/services/affiliate-task.service";
import type {
  AffiliateBudgetLedgerResult,
  FreezeAffiliateTaskBudgetInput,
  ReleaseAffiliateTaskBudgetInput
} from "../src/services/ledger.service";
import { buildPaginatedResponse, type PaginatedResponse } from "../src/utils/pagination";

const now = new Date("2026-08-26T00:00:00.000Z");
const shopActor: AuthenticatedAccessContext = {
  userId: 7,
  email: "shop@example.test",
  accessTokenJti: "shop-access",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 21,
  currentIdentityType: "merchant",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  roles: ["merchant_owner"],
  permissions: [
    "page:merchant-affiliate-task",
    "button:merchant-affiliate-task-create",
    "button:merchant-affiliate-task-submit"
  ]
};
const platformActor: AuthenticatedAccessContext = {
  userId: 99,
  email: "ops@example.test",
  accessTokenJti: "ops-access",
  accessTokenExpiresAt: 1_800_000_000,
  currentIdentityId: 22,
  currentIdentityType: "operator",
  currentIdentityScopeType: "platform",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: ["page:backoffice-affiliate", "button:backoffice-affiliate-review"]
};

const taskFields = {
  name: "Shibuya completed-service campaign",
  description: "Pay only after the referred booking is completed.",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 2_000_000,
  customerDiscountType: "fixed_jpy" as const,
  fixedDiscountJpy: 500,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 5_000,
  claimStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  claimEndsAt: new Date("2026-09-20T00:00:00.000Z"),
  taskStartsAt: new Date("2026-09-01T00:00:00.000Z"),
  taskEndsAt: new Date("2026-09-30T00:00:00.000Z"),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: 20,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "selected_services" as const,
  selectedServiceIds: [101]
};

class AffiliateBudgetLedgerSpy implements AffiliateBudgetLedgerPort {
  public readonly freezeCalls: FreezeAffiliateTaskBudgetInput[] = [];
  public readonly releaseCalls: ReleaseAffiliateTaskBudgetInput[] = [];
  public freezeError: unknown;
  public walletId = 501;
  private transactionId = 900;

  public async freezeAffiliateTaskBudget(
    input: FreezeAffiliateTaskBudgetInput
  ): Promise<AffiliateBudgetLedgerResult> {
    this.freezeCalls.push(input);
    if (this.freezeError) {
      throw this.freezeError;
    }
    return {
      walletId: this.walletId,
      transaction: this.transaction(input, "affiliate_task_budget_freeze")
    };
  }

  public async releaseAffiliateTaskBudget(
    input: ReleaseAffiliateTaskBudgetInput
  ): Promise<AffiliateBudgetLedgerResult> {
    this.releaseCalls.push(input);
    return {
      walletId: this.walletId,
      transaction: this.transaction(input, "affiliate_task_budget_release")
    };
  }

  private transaction(
    input: FreezeAffiliateTaskBudgetInput,
    type: "affiliate_task_budget_freeze" | "affiliate_task_budget_release"
  ) {
    return {
      id: this.transactionId++,
      transactionNo: `AFF-${this.transactionId}`,
      idempotencyKey: input.idempotencyKey,
      type,
      status: "applied" as const,
      referenceType: "affiliate_task",
      referenceId: input.taskId,
      actorUserId: input.actorUserId,
      amount: input.amountNdp,
      currency: "NDP" as const,
      metadata: null,
      createdAt: now,
      updatedAt: now,
      entries: []
    };
  }
}

class InMemoryAffiliateTaskRepository implements AffiliateTaskRepositoryPort {
  public readonly shops = new Map<number, AffiliateShopScopeRecord>();
  public readonly services = new Map<number, AffiliateServiceScopeRecord>();
  public readonly memberships = new Map<number, Set<number>>();
  public readonly manageableAccounts = new Map<number, Set<number>>();
  public tasks = new Map<number, AffiliateTaskRecord>();
  public reservations = new Map<number, AffiliateBudgetReservationRecord>();
  public budgetTransactionLinks: Array<{
    reservationId: number;
    ledgerTransactionId: number;
    kind: "freeze" | "release";
    amountNdp: number;
  }> = [];
  public auditRows: Array<{ action: string; taskId: number; actorUserId: number }> = [];

  private taskId = 1;
  private reservationId = 1;

  public async runInTransaction<T>(
    handler: (
      repository: AffiliateTaskRepositoryPort,
      transactionClient?: AffiliateTaskTransactionClient
    ) => Promise<T>,
    transactionClient?: AffiliateTaskTransactionClient
  ): Promise<T> {
    const taskSnapshot = structuredClone([...this.tasks.entries()]);
    const reservationSnapshot = structuredClone([...this.reservations.entries()]);
    const linkSnapshot = structuredClone(this.budgetTransactionLinks);
    const auditSnapshot = structuredClone(this.auditRows);

    try {
      return await handler(this, transactionClient ?? { affiliateTaskTransaction: true });
    } catch (error) {
      this.tasks = new Map(taskSnapshot);
      this.reservations = new Map(reservationSnapshot);
      this.budgetTransactionLinks.splice(0, this.budgetTransactionLinks.length, ...linkSnapshot);
      this.auditRows.splice(0, this.auditRows.length, ...auditSnapshot);
      throw error;
    }
  }

  public async getManageableMerchantAccountIds(userId: number): Promise<number[]> {
    return [...(this.manageableAccounts.get(userId) ?? new Set())];
  }

  public async findActiveShopsByIds(shopIds: number[]): Promise<AffiliateShopScopeRecord[]> {
    return shopIds.flatMap((shopId) => {
      const shop = this.shops.get(shopId);
      return shop ? [shop] : [];
    });
  }

  public async findActiveMerchantShops(
    merchantAccountId: number,
    shopIds: number[]
  ): Promise<AffiliateShopScopeRecord[]> {
    const membershipShopIds = this.memberships.get(merchantAccountId) ?? new Set();
    return shopIds.flatMap((shopId) => {
      const shop = this.shops.get(shopId);
      return shop && membershipShopIds.has(shopId) ? [shop] : [];
    });
  }

  public async findEligibleServices(input: {
    shopIds: number[];
    selectedServiceIds?: number[];
  }): Promise<AffiliateServiceScopeRecord[]> {
    const selectedIds = input.selectedServiceIds ? new Set(input.selectedServiceIds) : null;
    return [...this.services.values()].filter(
      (service) =>
        input.shopIds.includes(service.shopId) && (!selectedIds || selectedIds.has(service.id))
    );
  }

  public async createTask(input: AffiliateTaskPersistenceInput): Promise<AffiliateTaskRecord> {
    const createdAt = now;
    const task: AffiliateTaskRecord = {
      id: this.taskId++,
      ...input,
      lockVersion: 1,
      version: 1,
      status: "draft",
      reservedBudgetNdp: 0,
      allocatedBudgetNdp: 0,
      settledBudgetNdp: 0,
      releasedBudgetNdp: 0,
      reviewedById: null,
      reviewedAt: null,
      rejectionReason: null,
      submittedAt: null,
      activatedAt: null,
      createdAt,
      updatedAt: createdAt,
      shops: [],
      services: [],
      budgetReservation: null
    };
    this.tasks.set(task.id, task);
    return task;
  }

  public async updateDraftTask(
    input: UpdateAffiliateTaskPersistenceInput
  ): Promise<AffiliateTaskRecord | null> {
    const task = this.tasks.get(input.taskId);
    if (!task || task.status !== "draft" || task.lockVersion !== input.lockVersion) {
      return null;
    }
    Object.assign(task, input.fields, {
      lockVersion: task.lockVersion + 1,
      updatedAt: now
    });
    return task;
  }

  public async replaceTaskScopeSnapshots(input: {
    taskId: number;
    shops: AffiliateShopScopeRecord[];
    services: AffiliateServiceScopeRecord[];
  }): Promise<void> {
    const task = this.tasks.get(input.taskId);
    if (!task) {
      throw new Error("missing task");
    }
    task.shops = input.shops.map((shop, index) => ({
      id: index + 1,
      shopId: shop.id,
      shopNameSnapshot: shop.name
    }));
    task.services = input.services.map((service, index) => ({
      id: index + 1,
      shopId: service.shopId,
      serviceId: service.id,
      serviceNameSnapshot: service.name,
      servicePriceJpySnapshot: service.priceJpy
    }));
  }

  public async findTaskById(taskId: number): Promise<AffiliateTaskRecord | null> {
    return this.tasks.get(taskId) ?? null;
  }

  public async lockTask(taskId: number): Promise<AffiliateTaskRecord | null> {
    return this.findTaskById(taskId);
  }

  public async listPublisherTasks(input: {
    shopId?: number;
    merchantAccountIds: number[];
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const visible = [...this.tasks.values()].filter(
      (task) =>
        (input.shopId !== undefined && task.publisherShopId === input.shopId) ||
        (task.publisherMerchantAccountId !== null &&
          input.merchantAccountIds.includes(task.publisherMerchantAccountId))
    );
    return buildPaginatedResponse(visible, visible.length, input);
  }

  public async listBackofficeTasks(input: {
    page: number;
    pageSize: number;
  }): Promise<PaginatedResponse<AffiliateTaskRecord>> {
    const list = [...this.tasks.values()];
    return buildPaginatedResponse(list, list.length, input);
  }

  public async markTaskSubmitted(input: {
    taskId: number;
    submittedAt: Date;
    reservedBudgetNdp: number;
  }): Promise<void> {
    const task = this.tasks.get(input.taskId)!;
    task.status = "pending_review";
    task.submittedAt = input.submittedAt;
    task.reservedBudgetNdp = input.reservedBudgetNdp;
    task.lockVersion += 1;
  }

  public async createBudgetReservation(input: {
    taskId: number;
    walletId: number;
    totalFrozenNdp: number;
    idempotencyKey: string;
  }): Promise<AffiliateBudgetReservationRecord> {
    const reservation: AffiliateBudgetReservationRecord = {
      id: this.reservationId++,
      taskId: input.taskId,
      walletId: input.walletId,
      totalFrozenNdp: input.totalFrozenNdp,
      allocatedNdp: 0,
      capturedNdp: 0,
      releasedNdp: 0,
      status: "active",
      idempotencyKey: input.idempotencyKey,
      frozenAt: now,
      releasedAt: null
    };
    this.reservations.set(input.taskId, reservation);
    this.tasks.get(input.taskId)!.budgetReservation = reservation;
    return reservation;
  }

  public async createBudgetTransactionLink(input: {
    reservationId: number;
    ledgerTransactionId: number;
    kind: "freeze" | "release";
    amountNdp: number;
  }): Promise<void> {
    this.budgetTransactionLinks.push(input);
  }

  public async lockBudgetReservation(
    taskId: number
  ): Promise<AffiliateBudgetReservationRecord | null> {
    return this.reservations.get(taskId) ?? null;
  }

  public async markTaskApproved(input: {
    taskId: number;
    status: "scheduled" | "active";
    reviewedById: number;
    reviewedAt: Date;
    activatedAt: Date | null;
  }): Promise<void> {
    Object.assign(this.tasks.get(input.taskId)!, input, { lockVersion: 3 });
  }

  public async markTaskRejected(input: {
    taskId: number;
    reviewedById: number;
    reviewedAt: Date;
    rejectionReason: string;
    releasedBudgetNdp: number;
  }): Promise<void> {
    Object.assign(this.tasks.get(input.taskId)!, input, {
      status: "rejected",
      reservedBudgetNdp: 0,
      lockVersion: 3
    });
  }

  public async releaseBudgetReservation(input: {
    reservationId: number;
    releasedNdp: number;
    releasedAt: Date;
  }): Promise<void> {
    const reservation = [...this.reservations.values()].find(
      (candidate) => candidate.id === input.reservationId
    )!;
    reservation.releasedNdp = input.releasedNdp;
    reservation.releasedAt = input.releasedAt;
    reservation.status = "released";
  }

  public async createAuditLog(input: {
    actorUserId: number;
    action: string;
    taskId: number;
  }): Promise<void> {
    this.auditRows.push(input);
  }
}

const createFixture = () => {
  const repository = new InMemoryAffiliateTaskRepository();
  repository.shops.set(11, { id: 11, name: "Shibuya Shop" });
  repository.shops.set(12, { id: 12, name: "Ebisu Shop" });
  repository.services.set(101, {
    id: 101,
    shopId: 11,
    name: "Aroma 60",
    priceJpy: 8_800
  });
  repository.services.set(102, {
    id: 102,
    shopId: 12,
    name: "Head Spa 45",
    priceJpy: 7_700
  });
  repository.memberships.set(31, new Set([11, 12]));
  repository.manageableAccounts.set(shopActor.userId, new Set([31]));
  const ledger = new AffiliateBudgetLedgerSpy();
  let codeSequence = 1;
  const service = new AffiliateTaskService(repository, ledger, {
    now: () => now,
    createTaskCode: () => `AFF-TEST-${codeSequence++}`
  });

  return { repository, ledger, service };
};

const createShopDraft = async (
  service: AffiliateTaskService,
  override: Partial<CreateAffiliateTaskInput> = {}
) =>
  service.createDraft(shopActor, {
    publisherType: "shop",
    ...taskFields,
    ...override
  } as CreateAffiliateTaskInput);

describe("AffiliateTaskService drafts", () => {
  it("infers the current shop publisher and never freezes a draft", async () => {
    const { repository, ledger, service } = createFixture();

    const created = await createShopDraft(service);

    expect(created).toMatchObject({
      publisherType: "shop",
      publisherShopId: 11,
      publisherMerchantAccountId: null,
      status: "draft",
      reservedBudgetNdp: 0,
      shops: [{ shopId: 11, shopNameSnapshot: "Shibuya Shop" }],
      services: [{ serviceId: 101, serviceNameSnapshot: "Aroma 60" }]
    });
    expect(repository.reservations.size).toBe(0);
    expect(ledger.freezeCalls).toHaveLength(0);
  });

  it("creates a merchant-account draft only for active member shops", async () => {
    const { service } = createFixture();

    const created = await service.createDraft(shopActor, {
      publisherType: "merchant_account",
      merchantAccountId: 31,
      shopIds: [11, 12],
      ...taskFields,
      serviceScopeMode: "all_current_services",
      selectedServiceIds: []
    });

    expect(created).toMatchObject({
      publisherType: "merchant_account",
      publisherMerchantAccountId: 31,
      publisherShopId: null,
      shops: [{ shopId: 11 }, { shopId: 12 }],
      services: [{ serviceId: 101 }, { serviceId: 102 }]
    });

    await expect(
      service.createDraft(shopActor, {
        publisherType: "merchant_account",
        merchantAccountId: 31,
        shopIds: [11, 999],
        ...taskFields
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.affiliate.publisher_scope_invalid"
    });
  });

  it("rejects explicit service ids when all-current-services is selected", async () => {
    const { service } = createFixture();

    await expect(
      service.createDraft(shopActor, {
        publisherType: "shop",
        ...taskFields,
        serviceScopeMode: "all_current_services",
        selectedServiceIds: [101]
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION,
      message: "error.affiliate.service_scope_invalid"
    });
  });

  it("rejects stale draft updates without changing scope snapshots", async () => {
    const { service } = createFixture();
    const created = await createShopDraft(service);

    await expect(
      service.updateDraft(shopActor, created.id, {
        ...taskFields,
        name: "Stale edit",
        lockVersion: created.lockVersion + 1
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_TASK_CONFLICT,
      message: "error.affiliate.task_conflict"
    });
    expect((await service.getPublisherTask(shopActor, created.id)).name).toBe(taskFields.name);
  });

  it("rejects arbitrary shop ids when updating a shop-published draft", async () => {
    const { service } = createFixture();
    const created = await createShopDraft(service);

    await expect(
      service.updateDraft(shopActor, created.id, {
        ...taskFields,
        name: "Attempted cross-shop edit",
        shopIds: [12],
        lockVersion: created.lockVersion
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.affiliate.publisher_scope_invalid"
    });
    expect((await service.getPublisherTask(shopActor, created.id)).name).toBe(taskFields.name);
  });
});

describe("AffiliateTaskService submission and review", () => {
  it("atomically refreshes snapshots, freezes the full budget, and submits once", async () => {
    const { repository, ledger, service } = createFixture();
    const draft = await createShopDraft(service);
    repository.shops.set(11, { id: 11, name: "Shibuya Shop Updated" });
    repository.services.set(101, {
      id: 101,
      shopId: 11,
      name: "Aroma 60 Updated",
      priceJpy: 9_900
    });

    const submitted = await service.submit(shopActor, draft.id);
    const repeated = await service.submit(shopActor, draft.id);

    expect(repeated.id).toBe(submitted.id);
    expect(submitted).toMatchObject({
      status: "pending_review",
      reservedBudgetNdp: 2_000_000,
      shops: [{ shopNameSnapshot: "Shibuya Shop Updated" }],
      services: [
        { serviceNameSnapshot: "Aroma 60 Updated", servicePriceJpySnapshot: 9_900 }
      ],
      budgetReservation: {
        walletId: ledger.walletId,
        totalFrozenNdp: 2_000_000,
        status: "active"
      }
    });
    expect(ledger.freezeCalls).toEqual([
      expect.objectContaining({
        taskId: draft.id,
        ownerType: "shop",
        ownerId: 11,
        amountNdp: 2_000_000,
        actorUserId: shopActor.userId
      })
    ]);
    expect(repository.budgetTransactionLinks).toEqual([
      expect.objectContaining({ kind: "freeze", amountNdp: 2_000_000 })
    ]);
    expect(repository.auditRows).toContainEqual(
      expect.objectContaining({ action: "affiliate.task.submitted", taskId: draft.id })
    );
  });

  it("rolls back refreshed snapshots and task state when the wallet is insufficient", async () => {
    const { repository, ledger, service } = createFixture();
    const draft = await createShopDraft(service);
    const insufficient = Object.assign(new Error("insufficient"), {
      code: ERROR_CODES.WALLET_INSUFFICIENT_AVAILABLE,
      message: "error.wallet.insufficient_available",
      statusCode: 409
    });
    ledger.freezeError = insufficient;
    repository.shops.set(11, { id: 11, name: "Must Roll Back" });

    await expect(service.submit(shopActor, draft.id)).rejects.toBe(insufficient);
    expect(repository.tasks.get(draft.id)).toMatchObject({
      status: "draft",
      reservedBudgetNdp: 0,
      shops: [{ shopNameSnapshot: "Shibuya Shop" }]
    });
    expect(repository.reservations.size).toBe(0);
    expect(repository.budgetTransactionLinks).toHaveLength(0);
  });

  it("approves into scheduled before the start and blocks expired review", async () => {
    const { service } = createFixture();
    const draft = await createShopDraft(service);
    await service.submit(shopActor, draft.id);

    const approved = await service.approve(platformActor, draft.id);
    expect(approved).toMatchObject({
      status: "scheduled",
      reviewedById: platformActor.userId,
      reviewedAt: now,
      activatedAt: null
    });

    const expiredDraft = await createShopDraft(service, {
      name: "Expired campaign",
      claimStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      claimEndsAt: new Date("2026-08-10T00:00:00.000Z"),
      taskStartsAt: new Date("2026-08-01T00:00:00.000Z"),
      taskEndsAt: new Date("2026-08-20T00:00:00.000Z")
    });
    await expect(service.submit(shopActor, expiredDraft.id)).rejects.toMatchObject({
      code: ERROR_CODES.AFFILIATE_TASK_INVALID_STATE,
      message: "error.affiliate.task_window_expired"
    });
  });

  it("rejects once and atomically releases the entire unused budget", async () => {
    const { repository, ledger, service } = createFixture();
    const draft = await createShopDraft(service);
    await service.submit(shopActor, draft.id);

    const rejected = await service.reject(platformActor, draft.id, "Campaign proof is incomplete");
    const repeated = await service.reject(
      platformActor,
      draft.id,
      "Campaign proof is incomplete"
    );

    expect(repeated.id).toBe(rejected.id);
    expect(rejected).toMatchObject({
      status: "rejected",
      reservedBudgetNdp: 0,
      releasedBudgetNdp: 2_000_000,
      reviewedById: platformActor.userId,
      rejectionReason: "Campaign proof is incomplete",
      budgetReservation: {
        status: "released",
        releasedNdp: 2_000_000,
        releasedAt: now
      }
    });
    expect(ledger.releaseCalls).toEqual([
      expect.objectContaining({
        taskId: draft.id,
        walletId: ledger.walletId,
        ownerType: "shop",
        ownerId: 11,
        amountNdp: 2_000_000,
        actorUserId: platformActor.userId
      })
    ]);
    expect(repository.budgetTransactionLinks).toEqual([
      expect.objectContaining({ kind: "freeze" }),
      expect.objectContaining({ kind: "release", amountNdp: 2_000_000 })
    ]);
  });
});
