import { useEffect } from "react";
import { useAuth } from "../../auth/AuthProvider";
import type { AuthSession } from "../../auth/rbac";
import { getFormalMerchantScheduleCycleRange } from "../../components/scheduling/formalMerchantScheduleBoard";
import { addDays, getTodayDateKey, parseDateKey } from "../technician-schedule/model";
import type { BookingScheduleSlot } from "../booking/api";
import { schedulingApi, type SchedulePreloadResource } from "./api";
import { getFormalMerchantScheduleCacheResourceKey, writeFormalScheduleWindow } from "./formalScheduleWindowCache";

const pageSize = 100;
const maxConcurrentPageLoads = 4;
const startedSessions = new Set<string>();

function makeCycleWindow() {
  const range = getFormalMerchantScheduleCycleRange(getTodayDateKey());
  return {
    from: new Date(`${range.periodStart}T00:00:00+09:00`),
    to: new Date(`${range.periodEnd}T23:59:59.999+09:00`)
  };
}

function validateResourcePage(
  page: SchedulePreloadResource | null,
  first: SchedulePreloadResource | null,
  requestedPage: number
) {
  if (!first && !page) return;
  if (
    !first ||
    !page ||
    page.identityId !== first.identityId ||
    page.page !== requestedPage ||
    page.page_size !== first.page_size ||
    page.total !== first.total
  ) {
    throw new Error("error.pagination.no_progress");
  }
}

function appendSlots(target: BookingScheduleSlot[], resource: SchedulePreloadResource | null) {
  if (resource) target.push(...resource.list);
}

async function loadPreloadWindow(from: Date, to: Date) {
  const first = await schedulingApi.preload({ from, to, page: 1, pageSize });
  const merchantSlots: BookingScheduleSlot[] = [];
  const technicianSlots: BookingScheduleSlot[] = [];
  appendSlots(merchantSlots, first.merchant);
  appendSlots(technicianSlots, first.technician);
  const merchantPages = first.merchant ? Math.ceil(first.merchant.total / first.merchant.page_size) : 1;
  const technicianPages = first.technician ? Math.ceil(first.technician.total / first.technician.page_size) : 1;
  const totalPages = Math.max(merchantPages, technicianPages);

  for (let firstPage = 2; firstPage <= totalPages; firstPage += maxConcurrentPageLoads) {
    const pages = Array.from(
      { length: Math.min(maxConcurrentPageLoads, totalPages - firstPage + 1) },
      (_, index) => firstPage + index
    );
    const responses = await Promise.all(
      pages.map((page) => schedulingApi.preload({ from, to, page, pageSize }))
    );
    responses.forEach((response, index) => {
      const requestedPage = pages[index]!;
      if (requestedPage <= merchantPages) {
        validateResourcePage(response.merchant, first.merchant, requestedPage);
        appendSlots(merchantSlots, response.merchant);
      }
      if (requestedPage <= technicianPages) {
        validateResourcePage(response.technician, first.technician, requestedPage);
        appendSlots(technicianSlots, response.technician);
      }
    });
  }

  if (
    (first.merchant && merchantSlots.length !== first.merchant.total) ||
    (first.technician && technicianSlots.length !== first.technician.total)
  ) {
    throw new Error("error.pagination.no_progress");
  }

  return { first, merchantSlots, technicianSlots };
}

export async function preloadFormalSchedulesForSession(session: AuthSession) {
  const canLoadMerchant = session.allowedPortals.includes("merchant");
  const canLoadTechnician = session.allowedPortals.includes("technician");
  if (!canLoadMerchant && !canLoadTechnician) return;
  const cacheScope = `account:${session.id}`;
  const cycleWindow = makeCycleWindow();
  const { first, merchantSlots, technicianSlots } = await loadPreloadWindow(
    cycleWindow.from,
    cycleWindow.to
  );
  const writes: Promise<BookingScheduleSlot[]>[] = [];
  const today = getTodayDateKey();
  const dayWindow = {
    from: parseDateKey(today),
    to: parseDateKey(addDays(today, 1))
  };
  if (canLoadMerchant && first.merchant) {
    writes.push(writeFormalScheduleWindow({
      cacheScope,
      ...cycleWindow,
      resourceKey: getFormalMerchantScheduleCacheResourceKey(first.merchant.shopId),
      scheduleScope: "merchant-admin"
    }, merchantSlots, first.fetchedAt));
    writes.push(writeFormalScheduleWindow({
      cacheScope,
      ...dayWindow,
      resourceKey: getFormalMerchantScheduleCacheResourceKey(first.merchant.shopId),
      scheduleScope: "merchant-admin"
    }, merchantSlots.filter((slot) => {
      const startsAt = new Date(slot.startsAt);
      return startsAt >= dayWindow.from && startsAt < dayWindow.to;
    }), first.fetchedAt));
  }
  if (canLoadTechnician && first.technician) {
    writes.push(writeFormalScheduleWindow({
      cacheScope,
      ...cycleWindow,
      resourceKey: `tech-${first.technician.technicianProfileId}`,
      scheduleScope: "technician"
    }, technicianSlots, first.fetchedAt));

    const daySlots = technicianSlots.filter((slot) => {
      const startsAt = new Date(slot.startsAt);
      return startsAt >= dayWindow.from && startsAt < dayWindow.to;
    });
    writes.push(writeFormalScheduleWindow({
      cacheScope,
      ...dayWindow,
      resourceKey: `tech-${first.technician.technicianProfileId}`,
      scheduleScope: "technician"
    }, daySlots, first.fetchedAt));
  }
  await Promise.all(writes);
}

export function FormalSchedulePreloadBootstrap() {
  const { session } = useAuth();

  useEffect(() => {
    if (!session) return;
    if (!session.allowedPortals.includes("merchant") && !session.allowedPortals.includes("technician")) return;
    const key = [session.id, session.loggedInAt, session.activeIdentityId, session.merchantShopPublicId ?? ""].join(":");
    if (startedSessions.has(key)) return;
    startedSessions.add(key);
    void preloadFormalSchedulesForSession(session).catch(() => startedSessions.delete(key));
  }, [session]);

  return null;
}
