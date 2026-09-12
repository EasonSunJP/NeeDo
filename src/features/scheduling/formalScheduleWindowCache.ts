import { persistentResourceCache } from "../../lib/persistentResourceCache";
import type { BookingScheduleSlot } from "../booking/api";
import type { SchedulingScope } from "./api";

const maximumDisplayAgeMs = 24 * 60 * 60 * 1000;

type FormalScheduleWindowCacheInput = {
  cacheScope: string;
  from: Date;
  resourceKey: string;
  scheduleScope: SchedulingScope;
  to: Date;
};

type FormalScheduleWindowEnvelope = {
  fetchedAt: string;
  slots: BookingScheduleSlot[];
};

function cacheKey(input: FormalScheduleWindowCacheInput) {
  return [
    "calendar:formal-schedule",
    input.scheduleScope,
    encodeURIComponent(input.resourceKey),
    input.from.toISOString(),
    input.to.toISOString()
  ].join(":");
}

function sortSlots(slots: BookingScheduleSlot[]) {
  return [...slots].sort(
    (left, right) => left.startsAt.localeCompare(right.startsAt) || left.id - right.id
  );
}

export async function readFormalScheduleWindow(
  input: FormalScheduleWindowCacheInput,
  now = new Date()
): Promise<BookingScheduleSlot[] | null> {
  const cached = await persistentResourceCache.read<FormalScheduleWindowEnvelope>(
    input.cacheScope,
    cacheKey(input)
  );
  if (!cached || !Array.isArray(cached.slots)) return null;
  const fetchedAt = Date.parse(cached.fetchedAt);
  if (!Number.isFinite(fetchedAt) || now.getTime() - fetchedAt > maximumDisplayAgeMs) return null;
  return sortSlots(cached.slots);
}

export async function writeFormalScheduleWindow(
  input: FormalScheduleWindowCacheInput,
  slots: BookingScheduleSlot[],
  fetchedAt = new Date().toISOString()
): Promise<BookingScheduleSlot[]> {
  const sorted = sortSlots(slots);
  await persistentResourceCache.write<FormalScheduleWindowEnvelope>(
    input.cacheScope,
    cacheKey(input),
    { fetchedAt, slots: sorted }
  );
  return sorted;
}

export async function refreshFormalScheduleWindow(
  input: FormalScheduleWindowCacheInput,
  load: () => Promise<BookingScheduleSlot[]>
): Promise<BookingScheduleSlot[]> {
  const slots = await load();
  return writeFormalScheduleWindow(input, slots);
}
