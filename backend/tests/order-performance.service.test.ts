import { ERROR_CODES } from "../src/constants/error-codes";
import type {
  OrderPerformanceAssessmentPayload,
  OrderPerformanceRepositoryPort
} from "../src/repositories/order-performance.repository";
import { OrderPerformanceService } from "../src/services/order-performance.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const assessment: OrderPerformanceAssessmentPayload = {
  id: 41,
  bookingOrderId: 71,
  technicianProfileId: 31,
  outcome: "technician_cancelled",
  treatment: "special_excluded",
  version: 2,
  currentRevisionId: 91,
  createdAt: new Date("2026-09-01T02:00:00.000Z"),
  updatedAt: new Date("2026-09-01T03:00:00.000Z")
};

const actor: AuthenticatedAccessContext = {
  userId: 9,
  email: "operator@example.test",
  accessTokenJti: "operator-jti",
  accessTokenExpiresAt: 1_900_000_000,
  currentIdentityId: 901,
  currentIdentityType: "platform_operator",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  roles: ["operator"],
  permissions: ["backoffice:order-performance:write"]
};

const context = { ip: "127.0.0.1", userAgent: "jest" };
const input = {
  publicReason: "  交通中断による例外対応  ",
  internalNote: "  JR 停运已确认  ",
  idempotencyKey: "order-performance-command-0001",
  expectedRevision: 1
};

const createRepository = (): jest.Mocked<OrderPerformanceRepositoryPort> => ({
  classifyTechnicianUncompleted: jest.fn().mockResolvedValue({
    outcome: "ok",
    assessment: { ...assessment, outcome: "technician_uncompleted", treatment: "counted" },
    replayed: false
  }),
  applySpecialExclusion: jest.fn().mockResolvedValue({
    outcome: "ok",
    assessment,
    replayed: false
  }),
  revokeSpecialExclusion: jest.fn().mockResolvedValue({
    outcome: "ok",
    assessment: { ...assessment, treatment: "counted", version: 3 },
    replayed: false
  }),
  rebuildTechnicianSummary: jest.fn()
});

const auditInputFactory = {
  createInput: jest.fn((value) => ({
    actorId: value.actor.userId,
    action: value.action,
    targetType: value.targetType,
    targetId: value.targetId,
    ip: value.context.ip,
    userAgent: value.context.userAgent,
    metadata: value.metadata
  }))
};

describe("OrderPerformanceService", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ["classifyTechnicianUncompleted", "order_performance.technician_uncompleted.classify"],
    ["applySpecialExclusion", "order_performance.special_exclusion.apply"],
    ["revokeSpecialExclusion", "order_performance.special_exclusion.revoke"]
  ] as const)(
    "builds a canonical command and transaction-ready audit for %s",
    async (method, action) => {
      const repository = createRepository();
      const service = new OrderPerformanceService(repository, auditInputFactory as never);

      await expect(service[method](actor, context, 71, input)).resolves.toMatchObject({
        assessment: { bookingOrderId: 71 },
        replayed: false
      });

      expect(repository[method]).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingOrderId: 71,
          actorUserId: 9,
          publicReason: "交通中断による例外対応",
          internalNote: "JR 停运已确认",
          idempotencyKey: input.idempotencyKey,
          expectedRevision: 1,
          requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          auditLog: expect.objectContaining({
            actorId: 9,
            action,
            targetType: "booking_order",
            targetId: 71,
            ip: "127.0.0.1",
            userAgent: "jest",
            metadata: expect.objectContaining({
              bookingOrderId: 71,
              expectedRevision: 1
            })
          })
        })
      );
    }
  );

  it.each([
    [
      "not_found",
      ERROR_CODES.ORDER_PERFORMANCE_NOT_FOUND,
      404,
      "error.order_performance.not_found"
    ],
    [
      "ineligible",
      ERROR_CODES.ORDER_PERFORMANCE_INELIGIBLE,
      422,
      "error.order_performance.ineligible"
    ],
    [
      "version_conflict",
      ERROR_CODES.ORDER_PERFORMANCE_VERSION_CONFLICT,
      409,
      "error.order_performance.version_conflict"
    ],
    [
      "idempotency_conflict",
      ERROR_CODES.ORDER_PERFORMANCE_IDEMPOTENCY_CONFLICT,
      409,
      "error.order_performance.idempotency_conflict"
    ]
  ] as const)(
    "maps %s to a stable application error",
    async (outcome, code, statusCode, message) => {
      const repository = createRepository();
      repository.applySpecialExclusion.mockResolvedValue({ outcome });
      const service = new OrderPerformanceService(repository, auditInputFactory as never);

      await expect(service.applySpecialExclusion(actor, context, 71, input)).rejects.toMatchObject({
        code,
        statusCode,
        message
      });
    }
  );
});
