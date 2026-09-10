import type { RealtimeEventGatewayPort } from "./realtime-event.gateway";
import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  workError,
  workStatusScope,
  type WorkStatusPortal,
  type WorkStatusSnapshot
} from "../domain/work-status";
import {
  mapWorkEvent,
  WorkStatusRepository,
  type WorkStatusSession,
  type Obligation
} from "../repositories/work-status.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type { WorkStatusChange, WorkStatusQuery } from "../validators/work-status.validator";

const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const present = (status: string | null) =>
  status === "on_duty" || status === "traveling" || status === "resting" || status === "in_service";
export class WorkStatusService {
  constructor(
    private readonly repository: WorkStatusRepository = new WorkStatusRepository(),
    private readonly clock: () => Date = () => new Date(),
    private readonly gateway?: RealtimeEventGatewayPort
  ) {}
  async snapshot(actor: AuthenticatedAccessContext, portal: WorkStatusPortal, id?: number) {
    const scope = workStatusScope(actor, portal, id),
      now = this.clock();
    return this.repository.transaction(async (unit) => {
      await unit.assertScope(scope, now);
      return unit.snapshot(scope, now);
    });
  }
  async events(
    actor: AuthenticatedAccessContext,
    portal: WorkStatusPortal,
    id: number | undefined,
    query: WorkStatusQuery
  ) {
    const scope = workStatusScope(actor, portal, id),
      now = this.clock();
    return this.repository.transaction(async (unit) => {
      await unit.assertScope(scope, now);
      return unit.events(scope, query);
    });
  }
  async change(
    actor: AuthenticatedAccessContext,
    input: WorkStatusChange
  ): Promise<WorkStatusSnapshot> {
    const scope = workStatusScope(actor, "technician");
    const commandKey = `status:${actor.currentIdentityId}:${input.idempotencyKey}`,
      hash = digest(input);
    const result = await this.repository.transaction(async (unit) => {
      const now = this.clock();
      await unit.assertScope(scope, now);
      await unit.lock(scope.technicianProfileId);
      const replay = await unit.receipt(commandKey);
      if (replay) {
        if (replay.commandHash !== hash) throw workError("idempotency_conflict");
        return replay.result as unknown as WorkStatusSnapshot;
      }
      const state = await unit.state(scope.technicianProfileId);
      if ((state?.version ?? 0) !== input.expectedVersion) throw workError("version_conflict");
      if (await unit.activeService(scope.technicianProfileId))
        throw workError("active_service_conflict");
      const obligations = await unit.obligations(
        scope.technicianProfileId,
        now,
        new Date(now.getTime() + 1)
      );
      const affected =
        input.status === "off_duty"
          ? obligations.filter(
              (o) =>
                o.startsAt <= now &&
                o.endsAt > now &&
                (o.basis === "shift" || o.status === "CONFIRMED")
            )
          : [];
      const shiftEnd = affected
        .filter((o) => o.basis === "shift")
        .reduce((end, o) => (o.endsAt > end ? o.endsAt : end), now);
      if (shiftEnd > now) {
        for (const o of await unit.obligations(scope.technicianProfileId, now, shiftEnd))
          if (
            o.basis === "booking" &&
            o.status === "CONFIRMED" &&
            !affected.some((a) => a.basis === o.basis && a.id === o.id)
          )
            affected.push(o);
      }
      if (affected.length && (!input.confirmEarlyLeave || !input.reason))
        throw workError("early_leave_confirmation_required", 409, {
          affectedOrders: affected
            .filter((o) => o.basis === "booking")
            .map((o) => ({
              id: o.id,
              orderNo: o.orderNo ?? null,
              serviceName: o.serviceName ?? null,
              startsAt: o.startsAt.toISOString(),
              endsAt: o.endsAt.toISOString()
            }))
        });
      let shopId = input.shopId ?? null;
      if (input.orderId) {
        const order = await unit.order(input.orderId, scope.technicianProfileId);
        if (!order) throw workError("order_forbidden", 403);
        if (shopId !== null && shopId !== order.shopId) throw workError("shop_conflict");
        shopId = order.shopId;
      }
      if (shopId !== null && !(await unit.affiliation(scope.technicianProfileId, shopId, now)))
        throw workError("shop_forbidden", 403);
      if (shopId === null) {
        const shops = [...new Set(obligations.map((o) => o.shopId))];
        if (shops.length === 1) shopId = shops[0]!;
      }
      if (
        shopId === null &&
        present(input.status) &&
        !(await unit.hasActiveAffiliation(scope.technicianProfileId, now))
      ) {
        throw workError("shop_required", 403);
      }
      const epoch = await unit.epoch(now);
      for (const obligation of affected.filter(
        (o) =>
          o.basis === "shift" ||
          !affected.some(
            (a) =>
              a.basis === "shift" &&
              a.shopId === o.shopId &&
              a.startsAt <= o.startsAt &&
              a.endsAt >= o.endsAt
          )
      ))
        await this.recordIncident(
          unit,
          scope.technicianProfileId,
          obligation,
          "early_leave",
          now,
          now,
          input.reason ?? null,
          actor.userId,
          affected.filter(
            (o) =>
              o.basis === "booking" &&
              o.shopId === obligation.shopId &&
              o.startsAt < obligation.endsAt &&
              o.endsAt > now
          )
        );
      await this.detect(unit, scope.technicianProfileId, now, epoch.activatedAt, {
        at: now,
        toStatus: input.status,
        shopId
      });
      await unit.cas(scope.technicianProfileId, input.expectedVersion, input.status, now);
      const result = await unit.snapshot(scope, now);
      await unit.append({
        technicianProfileId: scope.technicianProfileId,
        shopId,
        orderId: input.orderId ?? null,
        actorId: actor.userId,
        kind: "status",
        fromStatus: state?.status ?? "unsynced",
        toStatus: input.status,
        at: now,
        actualAt: now,
        reason: input.reason ?? null,
        commandKey,
        commandHash: hash,
        result: result as unknown as Prisma.InputJsonValue
      });
      await unit.audit(actor.userId, scope.technicianProfileId, "technician.work_status.changed", {
        status: input.status,
        version: result.version,
        shopId,
        affectedOrderIds: affected.filter((o) => o.basis === "booking").map((o) => o.id)
      });
      return result;
    });
    await this.notifyTechnician(scope.technicianProfileId);
    return result;
  }
  async comment(
    actor: AuthenticatedAccessContext,
    portal: WorkStatusPortal,
    id: number | undefined,
    input: { message: string; idempotencyKey: string }
  ) {
    if (actor.isReadOnlyMerchantPreview) throw workError("read_only", 403);
    const scope = workStatusScope(actor, portal, id),
      key = `comment:${actor.currentIdentityId}:${input.idempotencyKey}`,
      hash = digest({ scope, message: input.message });
    const result = await this.repository.transaction(async (unit) => {
      const now = this.clock();
      await unit.assertScope(scope, now);
      await unit.lock(scope.technicianProfileId);
      const replay = await unit.receipt(key);
      if (replay) {
        if (replay.commandHash !== hash) throw workError("idempotency_conflict");
        return mapWorkEvent(replay, scope);
      }
      const row = await unit.append({
        technicianProfileId: scope.technicianProfileId,
        shopId: scope.shopId ?? null,
        kind: "comment",
        actorId: actor.userId,
        at: now,
        reason: input.message,
        commandKey: key,
        commandHash: hash
      });
      await unit.audit(actor.userId, scope.technicianProfileId, "technician.work_status.comment", {
        eventId: row.id,
        shopId: scope.shopId ?? null
      });
      return mapWorkEvent(row, scope);
    });
    await this.notifyTechnician(scope.technicianProfileId);
    return result;
  }
  async inspectTechnician(id: number) {
    const changed = await this.repository.transaction(async (unit) => {
      const now = this.clock();
      await unit.assertScope({ technicianProfileId: id }, now);
      await unit.lock(id);
      const epoch = await unit.epoch(now);
      const before = await unit.countEvents(id);
      await this.detect(unit, id, now, epoch.activatedAt);
      return (await unit.countEvents(id)) !== before;
    });
    if (changed) await this.notifyTechnician(id);
  }
  async inspectBatch(after = 0, take = 100) {
    const rows = await this.repository.candidates(after, take);
    for (const row of rows) await this.inspectTechnician(row.id);
    return rows.length === take ? rows[rows.length - 1]!.id : 0;
  }
  async notifyOrder(orderId: number) {
    try {
      const id = await this.repository.orderTechnicianId(orderId);
      if (id) await this.notifyTechnician(id);
    } catch {
      return;
    }
  }
  async notifyTechnician(id: number) {
    if (!this.gateway) return;
    // SSE is an invalidation hint; committed facts are recovered on reconnect and re-entry.
    try {
      for (const recipient of await this.repository.recipients(id))
        this.gateway.publish({
          id: randomUUID(),
          type: "technician.work_status.changed",
          recipientUserId: recipient.userId,
          recipientIdentityId: recipient.id,
          payload: { technicianProfileId: id },
          createdAt: this.clock().toISOString()
        });
    } catch {
      return;
    }
  }
  private async detect(
    unit: WorkStatusSession,
    id: number,
    now: Date,
    epoch: Date,
    extra?: { at: Date; toStatus: string; shopId: number | null }
  ) {
    const obligations = await unit.obligations(id, epoch, new Date(now.getTime() + 1));
    const history = await unit.history(id, now);
    if (extra) history.push(extra);
    for (const incident of await unit.pendingIncidents(id)) {
      const latestEnd =
        incident.availability?.endsAt && incident.availability.endsAt > incident.plannedEndAt
          ? incident.availability.endsAt
          : incident.plannedEndAt;
      const actual =
        incident.basis === "booking"
          ? incident.order?.serviceSession?.startedAt
          : history.find(
              (e) =>
                e.at > incident.plannedAt &&
                e.at < latestEnd &&
                (e.shopId === null || e.shopId === incident.shopId) &&
                present(e.toStatus)
            )?.at;
      if (actual) {
        await unit.append({
          technicianProfileId: id,
          shopId: incident.shopId,
          orderId: incident.orderId,
          incidentId: incident.id,
          kind: "service",
          actorId: null,
          at: actual,
          actualAt: actual
        });
        await unit.audit(null, id, "technician.attendance.resolved", {
          incidentId: incident.id,
          actualAt: actual.toISOString()
        });
      }
    }
    for (const obligation of obligations) {
      if (obligation.startsAt < epoch || obligation.startsAt >= now) continue;
      if (
        obligation.status === "CANCELLED" &&
        (!obligation.cancelledAt || obligation.cancelledAt <= obligation.startsAt)
      )
        continue;
      let actual = obligation.actualAt;
      if (obligation.basis === "shift") {
        const previousEnd = obligations
          .filter((o) => o.basis === "shift" && o.endsAt <= obligation.startsAt)
          .reduce((last, o) => (o.endsAt > last ? o.endsAt : last), epoch);
        const scoped = history.filter((e) => e.shopId === null || e.shopId === obligation.shopId);
        const prior = history
          .filter((e) => e.at <= obligation.startsAt && e.at >= previousEnd)
          .at(-1);
        if (
          prior &&
          present(prior.toStatus) &&
          (prior.shopId === null || prior.shopId === obligation.shopId)
        )
          continue;
        actual =
          scoped.find(
            (e) => e.at > obligation.startsAt && e.at < obligation.endsAt && present(e.toStatus)
          )?.at ?? null;
      }
      if (actual && actual <= obligation.startsAt) continue;
      await this.recordIncident(
        unit,
        id,
        obligation,
        "late",
        obligation.startsAt,
        actual,
        null,
        null
      );
    }
  }
  private async recordIncident(
    unit: WorkStatusSession,
    id: number,
    obligation: Obligation,
    kind: "late" | "early_leave",
    occurredAt: Date,
    actualAt: Date | null,
    reason: string | null,
    actorId: number | null,
    affectedOrders: Obligation[] = []
  ) {
    const key = `v1:${kind}:${obligation.basis}:${obligation.id}`;
    let incident = await unit.incident(key);
    if (!incident) {
      const row = await unit.createIncident({
        incidentKey: key,
        technicianProfileId: id,
        shopId: obligation.shopId,
        orderId: obligation.basis === "booking" ? obligation.id : null,
        availabilityId: obligation.basis === "shift" ? obligation.id : null,
        kind,
        basis: obligation.basis,
        plannedAt: kind === "late" ? obligation.startsAt : obligation.endsAt,
        plannedEndAt: obligation.endsAt,
        occurredAt,
        actualAt,
        reason
      });
      if (affectedOrders.length) await unit.appendAffectedOrders(row.id, affectedOrders);
      await unit.append({
        technicianProfileId: id,
        shopId: obligation.shopId,
        orderId: row.orderId,
        incidentId: row.id,
        kind,
        actorId,
        at: occurredAt,
        actualAt,
        reason
      });
      await unit.audit(actorId, id, "technician.attendance.detected", {
        incidentId: row.id,
        incidentKey: key
      });
      incident = { ...row, events: [] };
    } else if (actualAt && !incident.actualAt && !incident.events.length) {
      await unit.append({
        technicianProfileId: id,
        shopId: incident.shopId,
        orderId: incident.orderId,
        incidentId: incident.id,
        kind: "service",
        actorId,
        at: actualAt,
        actualAt,
        reason
      });
      await unit.audit(actorId, id, "technician.attendance.resolved", {
        incidentId: incident.id,
        actualAt: actualAt.toISOString()
      });
    }
  }
}
