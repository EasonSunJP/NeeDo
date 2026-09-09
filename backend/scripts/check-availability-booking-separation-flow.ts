import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import type { PrismaClient } from "@prisma/client";

const MARKER = "qa-availability-booking-separation-20260909";
const FOUNDATION_MARKER = "qa-multishop-pricing-settlement-20260909";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Availability separation assertion failed: ${message}`);
}

function loadLocalEnvironment() {
  const requested = process.env.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!requested) throw new Error("FORMAL_BACKEND_ENV_FILE is required");
  const path = resolve(requested);
  if (!existsSync(path)) throw new Error("FORMAL_BACKEND_ENV_FILE does not exist");
  const values = { ...process.env, ...parse(readFileSync(path, "utf8")) } as Record<string, string>;
  const target = new URL(values.DATABASE_URL ?? "");
  const database = decodeURIComponent(target.pathname.replace(/^\/+/, ""));
  assert(target.protocol === "mysql:", "DATABASE_URL must use MySQL");
  assert(["127.0.0.1", "localhost", "::1"].includes(target.hostname), "database must be loopback-only");
  assert(/(?:dev|test|local)/i.test(database) && !/(?:prod|staging|live)/i.test(database), "database must be local development data");
  assert(!/^(?:prod|production|staging)$/i.test(values.NODE_ENV ?? ""), "production environment refused");
  Object.entries(values).forEach(([name, value]) => { process.env[name] = value; });
  process.env.AUTH_TOKEN_AUDIENCE ||= "needo-backend";
}

async function findFoundation(prisma: PrismaClient) {
  const technician = await prisma.user.findUnique({
    where: { email: `${FOUNDATION_MARKER}-technician@example.invalid` }
  });
  assert(technician?.isTestAccount, "retained technician foundation is missing");
  const profile = await prisma.technicianProfile.findUnique({ where: { userId: technician.id } });
  assert(profile, "technician profile foundation is missing");
  const shops = await prisma.shop.findMany({
    where: { name: { startsWith: FOUNDATION_MARKER }, deletedAt: null },
    orderBy: { id: "asc" }
  });
  assert(shops.length >= 2, "two retained shops are required");
  const order = await prisma.bookingOrder.findFirst({
    where: {
      technicianProfileId: profile.id,
      serviceNameSnapshot: { startsWith: FOUNDATION_MARKER },
      status: { in: ["CONFIRMED", "IN_SERVICE", "AWAITING_CHECKOUT", "AWAITING_PAYMENT_CONFIRMATION", "COMPLETED"] },
      deletedAt: null
    },
    orderBy: { id: "asc" }
  });
  assert(order, "retained real booking foundation is missing");
  return { profile, shops, order };
}

async function ensureWindow(
  prisma: PrismaClient,
  repository: import("../src/repositories/booking.repository").BookingRepository,
  input: import("../src/repositories/booking.repository").AvailabilityWindowCreateInput
) {
  const technicianProfileId = input.scope === "technician" ? input.technicianProfileId : input.technicianProfileId!;
  const existing = await prisma.availability.findFirst({
    where: {
      technicianProfileId,
      sourceType: input.scope === "technician" ? "TECHNICIAN" : "SHOP",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      isScheduleControlWindow: true,
      isActive: true,
      deletedAt: null,
      ...(input.scope === "merchant" ? { shopId: input.shopId } : {})
    },
    include: { shop: true }
  });
  if (existing) return existing;
  const result = await repository.createAvailabilityWindow(input);
  assert(result.outcome === "ok", `control window creation failed: ${result.outcome}`);
  return prisma.availability.findUniqueOrThrow({ where: { id: result.window.id }, include: { shop: true } });
}

export async function runAvailabilityBookingSeparationCheck() {
  loadLocalEnvironment();
  const [{ prisma }, { BookingRepository }] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/repositories/booking.repository")
  ]);
  try {
    const { profile, shops, order } = await findFoundation(prisma);
    const repository = new BookingRepository(prisma);
    const bookingOverlapStart = new Date(order.startsAt.getTime() - 60 * 60_000);
    const bookingOverlapEnd = new Date(order.endsAt.getTime() + 60 * 60_000);
    const beforeOrder = { status: order.status, startsAt: order.startsAt.getTime(), endsAt: order.endsAt.getTime() };
    const freeWindow = await ensureWindow(prisma, repository, {
      scope: "technician",
      technicianProfileId: profile.id,
      startsAt: bookingOverlapStart,
      endsAt: bookingOverlapEnd,
      capacity: 1
    });
    const afterOrder = await prisma.bookingOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert(freeWindow.startsAt.getTime() === bookingOverlapStart.getTime(), "booking trimmed availability start");
    assert(freeWindow.endsAt.getTime() === bookingOverlapEnd.getTime(), "booking trimmed availability end");
    assert(afterOrder.status === beforeOrder.status && afterOrder.startsAt.getTime() === beforeOrder.startsAt && afterOrder.endsAt.getTime() === beforeOrder.endsAt, "availability creation mutated booking occupancy");

    const shopStart = new Date("2099-03-02T01:00:00.000Z");
    const shopEnd = new Date("2099-03-02T06:00:00.000Z");
    const shopWindow = await ensureWindow(prisma, repository, {
      scope: "merchant",
      shopId: shops[0]!.id,
      technicianProfileId: profile.id,
      startsAt: shopStart,
      endsAt: shopEnd,
      capacity: 1
    });
    const otherShop = shops.find((shop) => shop.id !== shops[0]!.id)!;
    const crossShop = await repository.createAvailabilityWindow({
      scope: "merchant",
      shopId: otherShop.id,
      technicianProfileId: profile.id,
      startsAt: new Date("2099-03-02T03:00:00.000Z"),
      endsAt: new Date("2099-03-02T07:00:00.000Z"),
      capacity: 1
    });
    assert(crossShop.outcome === "shop_control_conflict", "overlapping second shop obtained schedule control");
    const freeAgainstShop = await repository.createAvailabilityWindow({
      scope: "technician",
      technicianProfileId: profile.id,
      startsAt: new Date("2099-03-02T02:00:00.000Z"),
      endsAt: new Date("2099-03-02T04:00:00.000Z"),
      capacity: 1
    });
    assert(freeAgainstShop.outcome === "shop_control_conflict", "free availability overrode shop control");

    process.stdout.write(`${JSON.stringify({
      marker: MARKER,
      retained: true,
      availabilityBookingOverlap: {
        availabilityId: freeWindow.id,
        bookingOrderId: order.id,
        availabilityPreserved: true,
        bookingPreserved: true
      },
      shopControl: {
        availabilityId: shopWindow.id,
        controllingShopId: shops[0]!.id,
        rejectedShopId: otherShop.id,
        crossShopOutcome: crossShop.outcome,
        freeOverlapOutcome: freeAgainstShop.outcome
      }
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  runAvailabilityBookingSeparationCheck().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
