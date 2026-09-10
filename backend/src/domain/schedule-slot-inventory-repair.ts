import { createHash } from "node:crypto";

export type RepairSlotStatus = "AVAILABLE" | "BOOKED" | "BLOCKED";

export interface ScheduleSlotRepairServiceSnapshot {
  id: number;
  shopId: number;
  name: string;
  categoryId: number;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  serviceMode: string;
  status: string;
  deletedAt: Date | null;
  categoryIsActive: boolean;
  categoryDeletedAt: Date | null;
}

export interface ScheduleSlotRepairTechnicianServiceSnapshot {
  id: number;
  shopId: number | null;
  technicianId: number;
  sourceShopServiceId: number | null;
  name: string;
  categoryId: number;
  priceAmount: string;
  currency: string;
  durationMinutes: number;
  isActive: boolean;
  isBookable: boolean;
  reviewStatus: string;
  deletedAt: Date | null;
  categoryIsActive: boolean;
  categoryDeletedAt: Date | null;
  technicianStatus: string;
  technicianDeletedAt: Date | null;
  technicianUserIsActive: boolean;
  technicianUserDeletedAt: Date | null;
}

export interface ScheduleSlotRepairObservation {
  id: number;
  availabilityId: number | null;
  serviceId: number | null;
  technicianServiceId: number | null;
  shopId: number;
  technicianProfileId: number | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  bookedCount: number;
  status: RepairSlotStatus;
  service: ScheduleSlotRepairServiceSnapshot | null;
  technicianService: ScheduleSlotRepairTechnicianServiceSnapshot | null;
  relationCounts: {
    bookingOrders: number;
    routeEstimates: number;
    exchangeClaims: number;
    exchangeMatchParticipants: number;
  };
}

export interface ScheduleSlotRepairInventory {
  services: ScheduleSlotRepairServiceSnapshot[];
  technicianServices: ScheduleSlotRepairTechnicianServiceSnapshot[];
  activeAffiliations: ReadonlySet<string>;
}

export type ScheduleSlotRepairReason =
  | "slot_without_service"
  | "service_missing"
  | "service_deleted"
  | "service_unpublished"
  | "service_shop_mismatch"
  | "service_category_inactive"
  | "technician_service_missing"
  | "technician_service_deleted"
  | "technician_service_inactive"
  | "technician_service_unbookable"
  | "technician_service_unapproved"
  | "technician_service_shop_mismatch"
  | "technician_service_owner_mismatch"
  | "technician_service_category_inactive"
  | "technician_inactive"
  | "technician_affiliation_inactive";

export interface ScheduleSlotRepairPlanEntry {
  slotId: number;
  kind: "protected" | "repair_replace" | "repair_remove";
  reasons: ScheduleSlotRepairReason[];
  replacement: { serviceId: number | null; technicianServiceId: number | null } | null;
  candidateCount: number;
  original: {
    availabilityId: number | null;
    serviceId: number | null;
    technicianServiceId: number | null;
    shopId: number;
    technicianProfileId: number | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    status: RepairSlotStatus;
  };
}

export interface ScheduleSlotRepairPlan {
  entries: ScheduleSlotRepairPlanEntry[];
  summary: {
    scanned: number;
    current: number;
    stale: number;
    protected: number;
    replace: number;
    remove: number;
  };
}

const affiliationKey = (shopId: number, technicianProfileId: number): string =>
  `${shopId}:${technicianProfileId}`;

const canonicalDecimal = (value: string): string => {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/u, "");
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction.length > 0
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
};

const isCurrentService = (
  service: ScheduleSlotRepairServiceSnapshot,
  slotShopId?: number
): boolean =>
  service.deletedAt === null &&
  service.status === "published" &&
  service.categoryDeletedAt === null &&
  service.categoryIsActive &&
  (slotShopId === undefined || service.shopId === slotShopId);

const isCurrentTechnicianService = (
  service: ScheduleSlotRepairTechnicianServiceSnapshot,
  slot: Pick<ScheduleSlotRepairObservation, "shopId" | "technicianProfileId">,
  inventory: ScheduleSlotRepairInventory
): boolean =>
  service.deletedAt === null &&
  service.isActive &&
  service.isBookable &&
  service.reviewStatus === "APPROVED" &&
  service.categoryDeletedAt === null &&
  service.categoryIsActive &&
  service.technicianDeletedAt === null &&
  service.technicianStatus === "published" &&
  service.technicianUserDeletedAt === null &&
  service.technicianUserIsActive &&
  slot.technicianProfileId === service.technicianId &&
  (service.shopId === null || service.shopId === slot.shopId) &&
  inventory.activeAffiliations.has(affiliationKey(slot.shopId, service.technicianId));

const sameServiceSemantics = (
  candidate: ScheduleSlotRepairServiceSnapshot,
  original: ScheduleSlotRepairServiceSnapshot
): boolean =>
  candidate.shopId === original.shopId &&
  candidate.name === original.name &&
  candidate.categoryId === original.categoryId &&
  canonicalDecimal(candidate.priceAmount) === canonicalDecimal(original.priceAmount) &&
  candidate.currency === original.currency &&
  candidate.durationMinutes === original.durationMinutes &&
  candidate.serviceMode === original.serviceMode;

const sameTechnicianServiceSemantics = (
  candidate: ScheduleSlotRepairTechnicianServiceSnapshot,
  original: ScheduleSlotRepairTechnicianServiceSnapshot
): boolean =>
  candidate.technicianId === original.technicianId &&
  candidate.shopId === original.shopId &&
  candidate.name === original.name &&
  candidate.categoryId === original.categoryId &&
  canonicalDecimal(candidate.priceAmount) === canonicalDecimal(original.priceAmount) &&
  candidate.currency === original.currency &&
  candidate.durationMinutes === original.durationMinutes;

const staleReasons = (
  slot: ScheduleSlotRepairObservation,
  inventory: ScheduleSlotRepairInventory
): ScheduleSlotRepairReason[] => {
  const reasons: ScheduleSlotRepairReason[] = [];
  if (slot.serviceId === null && slot.technicianServiceId === null) {
    reasons.push("slot_without_service");
  }
  if (slot.serviceId !== null) {
    if (!slot.service) reasons.push("service_missing");
    else {
      if (slot.service.deletedAt !== null) reasons.push("service_deleted");
      if (slot.service.status !== "published") reasons.push("service_unpublished");
      if (slot.service.shopId !== slot.shopId) reasons.push("service_shop_mismatch");
      if (slot.service.categoryDeletedAt !== null || !slot.service.categoryIsActive) {
        reasons.push("service_category_inactive");
      }
    }
  }
  if (slot.technicianServiceId !== null) {
    if (!slot.technicianService) reasons.push("technician_service_missing");
    else {
      const service = slot.technicianService;
      if (service.deletedAt !== null) reasons.push("technician_service_deleted");
      if (!service.isActive) reasons.push("technician_service_inactive");
      if (!service.isBookable) reasons.push("technician_service_unbookable");
      if (service.reviewStatus !== "APPROVED") reasons.push("technician_service_unapproved");
      if (service.shopId !== null && service.shopId !== slot.shopId) {
        reasons.push("technician_service_shop_mismatch");
      }
      if (service.technicianId !== slot.technicianProfileId) {
        reasons.push("technician_service_owner_mismatch");
      }
      if (service.categoryDeletedAt !== null || !service.categoryIsActive) {
        reasons.push("technician_service_category_inactive");
      }
      if (
        service.technicianDeletedAt !== null ||
        service.technicianStatus !== "published" ||
        service.technicianUserDeletedAt !== null ||
        !service.technicianUserIsActive
      ) {
        reasons.push("technician_inactive");
      }
    }
  }
  if (
    slot.technicianProfileId !== null &&
    !inventory.activeAffiliations.has(affiliationKey(slot.shopId, slot.technicianProfileId))
  ) {
    reasons.push("technician_affiliation_inactive");
  }
  return reasons;
};

const hasProtectedRelations = (slot: ScheduleSlotRepairObservation): boolean =>
  Object.values(slot.relationCounts).some((count) => count > 0);

const replacementCandidates = (
  slot: ScheduleSlotRepairObservation,
  inventory: ScheduleSlotRepairInventory
): Array<{ serviceId: number | null; technicianServiceId: number | null }> => {
  const serviceCandidates = slot.service
    ? inventory.services.filter(
        (candidate) =>
          isCurrentService(candidate, slot.shopId) && sameServiceSemantics(candidate, slot.service!)
      )
    : [];
  const technicianServiceCandidates = slot.technicianService
    ? inventory.technicianServices.filter(
        (candidate) =>
          isCurrentTechnicianService(candidate, slot, inventory) &&
          sameTechnicianServiceSemantics(candidate, slot.technicianService!)
      )
    : [];

  if (slot.serviceId !== null && slot.technicianServiceId !== null) {
    return serviceCandidates.flatMap((serviceCandidate) =>
      technicianServiceCandidates
        .filter((candidate) => candidate.sourceShopServiceId === serviceCandidate.id)
        .map((candidate) => ({
          serviceId: serviceCandidate.id,
          technicianServiceId: candidate.id
        }))
    );
  }
  if (slot.serviceId !== null) {
    return serviceCandidates.map((candidate) => ({
      serviceId: candidate.id,
      technicianServiceId: null
    }));
  }
  if (slot.technicianServiceId !== null) {
    return technicianServiceCandidates
      .filter(
        (candidate) =>
          candidate.sourceShopServiceId === null ||
          inventory.services.some(
            (source) => source.id === candidate.sourceShopServiceId && isCurrentService(source)
          )
      )
      .map((candidate) => ({ serviceId: null, technicianServiceId: candidate.id }));
  }
  return [];
};

export const buildScheduleSlotRepairPlan = (
  slots: ScheduleSlotRepairObservation[],
  inventory: ScheduleSlotRepairInventory,
  now: Date
): ScheduleSlotRepairPlan => {
  const entries: ScheduleSlotRepairPlanEntry[] = [];
  let current = 0;
  for (const slot of slots) {
    const reasons = staleReasons(slot, inventory);
    if (reasons.length === 0) {
      current += 1;
      continue;
    }
    const original = {
      availabilityId: slot.availabilityId,
      serviceId: slot.serviceId,
      technicianServiceId: slot.technicianServiceId,
      shopId: slot.shopId,
      technicianProfileId: slot.technicianProfileId,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      capacity: slot.capacity,
      status: slot.status
    };
    if (
      slot.startsAt <= now ||
      slot.status !== "AVAILABLE" ||
      slot.bookedCount !== 0 ||
      hasProtectedRelations(slot)
    ) {
      entries.push({
        slotId: slot.id,
        kind: "protected",
        reasons,
        replacement: null,
        candidateCount: 0,
        original
      });
      continue;
    }
    const candidates = replacementCandidates(slot, inventory);
    entries.push({
      slotId: slot.id,
      kind: candidates.length === 1 ? "repair_replace" : "repair_remove",
      reasons,
      replacement: candidates.length === 1 ? candidates[0]! : null,
      candidateCount: candidates.length,
      original
    });
  }
  entries.sort((left, right) => left.slotId - right.slotId);
  return {
    entries,
    summary: {
      scanned: slots.length,
      current,
      stale: entries.length,
      protected: entries.filter((entry) => entry.kind === "protected").length,
      replace: entries.filter((entry) => entry.kind === "repair_replace").length,
      remove: entries.filter((entry) => entry.kind === "repair_remove").length
    }
  };
};

export const digestScheduleSlotRepairPlan = (plan: ScheduleSlotRepairPlan): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        entries: [...plan.entries].sort((left, right) => left.slotId - right.slotId),
        summary: plan.summary
      })
    )
    .digest("hex");
