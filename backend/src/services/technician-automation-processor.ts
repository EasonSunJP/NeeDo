import {
  evaluateTechnicianAutomationRules,
  type TechnicianAutomationEvaluationContext
} from "../domain/technician-automation-rules";
import {
  technicianAutomationRulesSchema,
  type TechnicianAutomationRules
} from "../validators/technician-automation.validator";
import type { ExchangeClaimServiceRef } from "../types/exchange-claim.types";

export interface TechnicianAutomationCandidate {
  settingId: number;
  technicianProfileId: number;
  technicianUserId: number;
  technicianIdentityId: number;
  technicianPublicId: string;
  ruleVersion: number;
  rules: TechnicianAutomationRules;
  context: TechnicianAutomationEvaluationContext;
}

export interface TechnicianRequestAutomationCandidate extends TechnicianAutomationCandidate {
  scheduleSlotId: number;
  serviceRef?: ExchangeClaimServiceRef;
  quoteAmountJpy: number;
  message: string;
}

export interface TechnicianAutomationProcessorRepositoryPort {
  loadBookingCandidate(orderId: number): Promise<TechnicianAutomationCandidate | null>;
  loadRequestCandidates(postId: number, selection?: {
    technicianProfileId: number;
    scheduleSlotId: number;
    serviceRef?: ExchangeClaimServiceRef;
  }): Promise<TechnicianRequestAutomationCandidate[]>;
  reserveDecision(input: {
    settingId: number;
    technicianProfileId: number;
    kind: "booking" | "request";
    targetType: "booking_order" | "exchange_request";
    targetId: number;
    actionType: "accept_booking" | "apply_request";
    ruleVersion: number;
    idempotencyKey: string;
  }): Promise<boolean>;
  completeDecision(input: {
    idempotencyKey: string;
    outcome: "not_matched" | "executed" | "action_failed" | "already_handled";
    matchedConditions: string[];
    failedReasons: string[];
    executedAt: Date | null;
  }): Promise<void>;
  notifyAutomaticAction(input: {
    technicianUserId: number;
    technicianIdentityId: number;
    kind: "booking" | "request";
    targetId: number;
  }): Promise<void>;
}

export interface TechnicianBookingAutomationAuthority {
  confirmBooking(input: {
    orderId: number;
    technicianUserId: number;
    technicianIdentityId: number;
    technicianProfileId: number;
    ruleVersion: number;
  }): Promise<void>;
}

export interface TechnicianRequestAutomationAuthority {
  applyRequest(input: {
    postId: number;
    technicianUserId: number;
    technicianIdentityId: number;
    technicianProfileId: number;
    technicianPublicId: string;
    scheduleSlotId: number;
    serviceRef?: ExchangeClaimServiceRef;
    quoteAmountJpy: number;
    message: string;
    idempotencyKey: string;
    suppressQuickMatching: true;
  }): Promise<void>;
}

export class TechnicianAutomationProcessor {
  public constructor(
    private readonly repository: TechnicianAutomationProcessorRepositoryPort,
    private readonly bookingAuthority: TechnicianBookingAutomationAuthority,
    private readonly requestAuthority: TechnicianRequestAutomationAuthority,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async processBooking(orderId: number): Promise<void> {
    const candidate = await this.repository.loadBookingCandidate(orderId);
    if (!candidate) return;
    await this.processCandidate("booking", orderId, candidate, async () => this.repository.loadBookingCandidate(orderId), async (idempotencyKey, current) => {
      await this.bookingAuthority.confirmBooking({
        orderId,
        technicianUserId: current.technicianUserId,
        technicianIdentityId: current.technicianIdentityId,
        technicianProfileId: current.technicianProfileId,
        ruleVersion: current.ruleVersion
      });
      void idempotencyKey;
    });
  }

  public async processRequest(postId: number): Promise<void> {
    const candidates = await this.repository.loadRequestCandidates(postId);
    for (const candidate of candidates) {
      await this.processCandidate("request", postId, candidate, async () => {
        const current = await this.repository.loadRequestCandidates(postId, {
          technicianProfileId: candidate.technicianProfileId,
          scheduleSlotId: candidate.scheduleSlotId,
          ...(candidate.serviceRef ? { serviceRef: candidate.serviceRef } : {})
        });
        return current.find((item) => item.technicianProfileId === candidate.technicianProfileId) ?? null;
      }, async (idempotencyKey, currentCandidate) => {
        const current = currentCandidate as TechnicianRequestAutomationCandidate;
        await this.requestAuthority.applyRequest({
          postId,
          technicianUserId: current.technicianUserId,
          technicianIdentityId: current.technicianIdentityId,
          technicianProfileId: current.technicianProfileId,
          technicianPublicId: current.technicianPublicId,
          scheduleSlotId: current.scheduleSlotId,
          ...(current.serviceRef ? { serviceRef: current.serviceRef } : {}),
          quoteAmountJpy: current.quoteAmountJpy,
          message: current.message,
          idempotencyKey,
          suppressQuickMatching: true
        });
      });
    }
  }

  private async processCandidate(
    kind: "booking" | "request",
    targetId: number,
    candidate: TechnicianAutomationCandidate,
    reload: () => Promise<TechnicianAutomationCandidate | null>,
    action: (idempotencyKey: string, candidate: TechnicianAutomationCandidate) => Promise<void>
  ): Promise<void> {
    const actionType = kind === "booking" ? "accept_booking" : "apply_request";
    const targetType = kind === "booking" ? "booking_order" : "exchange_request";
    const idempotencyKey = `${kind}:${targetId}:${candidate.technicianProfileId}:${actionType}`;
    const reserved = await this.repository.reserveDecision({
      settingId: candidate.settingId,
      technicianProfileId: candidate.technicianProfileId,
      kind,
      targetType,
      targetId,
      actionType,
      ruleVersion: candidate.ruleVersion,
      idempotencyKey
    });
    if (!reserved) return;

    const initialRules = technicianAutomationRulesSchema.parse(candidate.rules);
    const initialEvaluation = evaluateTechnicianAutomationRules(kind, initialRules, candidate.context);
    if (!initialEvaluation.matched) {
      await this.repository.completeDecision({
        idempotencyKey,
        outcome: "not_matched",
        matchedConditions: initialEvaluation.matchedConditions,
        failedReasons: initialEvaluation.failedReasons,
        executedAt: null
      });
      return;
    }

    const currentCandidate = await reload();
    if (!currentCandidate) {
      await this.repository.completeDecision({
        idempotencyKey,
        outcome: "not_matched",
        matchedConditions: [],
        failedReasons: ["automation_candidate_stale"],
        executedAt: null
      });
      return;
    }
    const rules = technicianAutomationRulesSchema.parse(currentCandidate.rules);
    const evaluation = evaluateTechnicianAutomationRules(kind, rules, currentCandidate.context);
    if (!evaluation.matched) {
      await this.repository.completeDecision({
        idempotencyKey,
        outcome: "not_matched",
        matchedConditions: evaluation.matchedConditions,
        failedReasons: evaluation.failedReasons,
        executedAt: null
      });
      return;
    }

    try {
      await action(idempotencyKey, currentCandidate);
      const executedAt = this.now();
      await this.repository.completeDecision({
        idempotencyKey,
        outcome: "executed",
        matchedConditions: evaluation.matchedConditions,
        failedReasons: [],
        executedAt
      });
      try {
        await this.repository.notifyAutomaticAction({
          technicianUserId: currentCandidate.technicianUserId,
          technicianIdentityId: currentCandidate.technicianIdentityId,
          kind,
          targetId
        });
      } catch {
        // Notification delivery is intentionally best effort after the business transaction.
      }
    } catch (error) {
      await this.repository.completeDecision({
        idempotencyKey,
        outcome: "action_failed",
        matchedConditions: evaluation.matchedConditions,
        failedReasons: [this.errorReason(error)],
        executedAt: null
      });
    }
  }

  private errorReason(error: unknown): string {
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
      return `action:${error.message}`;
    }
    return "action:unknown_failure";
  }
}
