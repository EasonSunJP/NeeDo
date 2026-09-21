import { workError, type WorkStatus } from "./work-status";
import type { WorkStatusSession } from "../repositories/work-status.repository";
// Invoked inside the existing booking transaction; the stored manual state is retained.
export async function recordBookingWorkTransition(
  unit: WorkStatusSession,
  input: {
    technicianProfileId: number | null;
    orderId: number;
    shopId: number;
    actorId: number | null;
    at: Date;
    started: boolean;
  }
) {
  if (!input.technicianProfileId) return;
  const id = input.technicianProfileId;
  await unit.lock(id, input.shopId, input.at);
  const state = await unit.state(id, input.shopId);
  if (!state) return;
  if (input.started && (state.status === "off_duty" || state.status === "unsynced"))
    throw workError("off_duty_required");
  const active = await unit.activeService(id, input.shopId);
  await unit.cas(id, input.shopId, state.version, state.status as WorkStatus, input.at);
  await unit.append({
    technicianProfileId: id,
    shopId: input.shopId,
    orderId: input.orderId,
    actorId: input.actorId,
    kind: "service",
    at: input.at,
    actualAt: input.at,
    fromStatus: input.started ? state.status : "in_service",
    toStatus: active ? "in_service" : state.status,
    reason: null
  });
  await unit.audit(input.actorId, id, "technician.work_status.service", {
    orderId: input.orderId,
    started: input.started,
    version: state.version + 1
  });
}
