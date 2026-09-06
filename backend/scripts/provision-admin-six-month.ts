import { config as loadDotenv } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { buildAdminStaffingPlan, selectContactTargets } from "../src/simulation/admin-six-month-plan";

const namespace = "admin_6m_20260906_v1";
const emails: Array<"admin@lifedance.com" | "admina@lifedance.com"> = ["admin@lifedance.com", "admina@lifedance.com"];
const identityTypes = ["customer", "technician", "merchant_owner"];
const startDate = "2026-09-06";
const endDate = "2027-03-06";
const planSchema = z.object({
  namespace: z.literal(namespace), startDate: z.literal(startDate), endDate: z.literal(endDate),
  accounts: z.array(z.object({
    email: z.enum(["admin@lifedance.com", "admina@lifedance.com"]),
    staff: z.array(z.string().email()).length(50),
    contacts: z.array(z.object({ email: z.string().email(), type: z.enum(["customer", "technician", "merchant_owner"]) })),
    shifts: z.array(z.object({ email: z.string().email(), date: z.string(), startsAt: z.string().datetime(), endsAt: z.string().datetime() }))
  })).length(2)
});
type Plan = z.infer<typeof planSchema>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const arg = (name: string) => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const main = async () => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  loadDotenv({ path: envFile, quiet: true });
  process.env.ENV_FILE = envFile;
  const database = new URL(process.env.DATABASE_URL || "");
  const target = arg("--target") || "local";
  assert(target === "local" || target === "staging", "Unsupported target");
  if (target === "local") {
    assert(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.pathname === "/needo_dev" && process.env.NODE_ENV !== "production", "Local needo_dev target required");
  } else {
    assert(process.env.DEPLOY_ENV === "staging" && /staging/.test(database.pathname) && !/prod/.test(database.pathname), "Explicit staging environment/database required");
    assert(arg("--plan"), "Staging requires the reviewed local plan");
  }
  const { prisma, disconnectPrisma } = await import("../src/prisma/client");
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, isTestAccount: true, deletedAt: null, OR: [{ email: { in: emails } }, { email: { startsWith: "sim." } }] },
      orderBy: { email: "asc" }, take: 1000,
      select: { id: true, email: true, isTestAccount: true, identities: { where: { isActive: true, deletedAt: null, type: { in: identityTypes } }, select: { id: true, userId: true, type: true, scopeId: true, isActive: true } }, technicianProfile: { select: { id: true, status: true, deletedAt: true } } }
    });
    const userByEmail = new Map(users.map(user => [user.email, user]));
    const owner = (email: string) => {
      const user = userByEmail.get(email);
      assert(user, `Missing active test account ${email}`);
      for (const type of identityTypes) assert(user.identities.filter(i => i.type === type).length === 1, `Expected one ${type} identity for ${email}`);
      return user;
    };
    const technicians = users.filter(user => /^sim\.tech\.\d{3}@needo\.local$/.test(user.email) && user.technicianProfile?.status === "published" && user.technicianProfile.deletedAt === null && user.identities.some(i => i.type === "technician"));
    assert(technicians.length >= 100, "100 existing active formal test technicians required");
    let plan: Plan;
    if (arg("--plan")) {
      plan = planSchema.parse(JSON.parse(readFileSync(arg("--plan")!, "utf8")));
    } else {
      const candidates = users.flatMap(user => user.identities.map(identity => ({ ...identity, email: user.email, isTestAccount: user.isTestAccount })));
      const accounts: Plan["accounts"] = [];
      for (const [index, email] of emails.entries()) {
        const account = owner(email);
        const staff = technicians.slice(index * 50, (index + 1) * 50);
        const shopId = account.identities.find(i => i.type === "merchant_owner")!.scopeId!;
        const profiles = staff.map(user => user.technicianProfile!.id);
        const bookings = await prisma.bookingOrder.findMany({ where: { shopId: { not: shopId }, technicianProfileId: { in: profiles }, deletedAt: null, status: { in: ["CONFIRMED", "IN_SERVICE"] }, startsAt: { lt: new Date(`${endDate}T00:00:00+09:00`) }, endsAt: { gt: new Date(`${startDate}T00:00:00+09:00`) } }, select: { technicianProfileId: true, startsAt: true, endsAt: true } });
        const conflicts = bookings.filter(row => row.technicianProfileId !== null).map(row => ({ technicianProfileId: row.technicianProfileId!, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }));
        const shifts = buildAdminStaffingPlan(profiles, startDate, endDate, conflicts);
        const emailByProfile = new Map(staff.map(user => [user.technicianProfile!.id, user.email]));
        const contacts = [
          ...selectContactTargets(candidates.filter(c => /^sim\.customer\./.test(c.email)), account.id, "customer", 20),
          ...selectContactTargets(candidates.filter(c => staff.some(user => user.id === c.userId)), account.id, "technician", 50),
          ...selectContactTargets(candidates.filter(c => /^sim\.shop\./.test(c.email)), account.id, "merchant_owner", 5)
        ].map(({ email: contactEmail, type }) => ({ email: contactEmail, type: type as "customer" | "technician" | "merchant_owner" }));
        accounts.push({ email, staff: staff.map(user => user.email), contacts, shifts: shifts.map(({ technicianProfileId, ...shift }) => ({ ...shift, email: emailByProfile.get(technicianProfileId)! })) });
      }
      plan = planSchema.parse({ namespace, startDate, endDate, accounts });
    }
    const digest = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    assert(new Set(plan.accounts.map(a => a.email)).size === 2, "Duplicate owner");
    assert(new Set(plan.accounts.flatMap(a => a.staff)).size === 100, "Staff pools overlap");
    if (arg("--export")) writeFileSync(arg("--export")!, JSON.stringify(plan), { mode: 0o600 });
    for (const accountPlan of plan.accounts) {
      const account = owner(accountPlan.email);
      const shopId = account.identities.find(i => i.type === "merchant_owner")!.scopeId!;
      const shop = await prisma.shop.findFirst({ where: { id: shopId, ownerUserId: account.id, deletedAt: null, status: "published" }, select: { id: true, name: true } });
      assert(shop, "Owned published shop required");
      const staff = accountPlan.staff.map(email => { const user = userByEmail.get(email); assert(user?.technicianProfile?.status === "published", `Missing staff ${email}`); return user; });
      const profileByEmail = new Map(staff.map(user => [user.email, user.technicianProfile!.id]));
      const service = await prisma.service.findFirst({ where: { shopId, status: "published", deletedAt: null, durationMinutes: 60, serviceMode: "store" }, orderBy: { id: "asc" }, select: { id: true, name: true } });
      assert(service, `Published 60-minute shop service required for ${accountPlan.email}`);
      if (process.argv.includes("--prepare-partners")) {
        assert(!process.argv.includes("--rollback"), "Partnership preparation cannot be combined with rollback");
        await prisma.$transaction(async tx => {
          for (const id of [...profileByEmail.values()].sort((a, b) => a - b)) await tx.$queryRaw`SELECT id FROM technician_profiles WHERE id = ${id} FOR UPDATE`;
          const action = `${namespace}.partnerships`;
          const existing = await tx.auditLog.findFirst({ where: { actorId: account.id, action, deletedAt: null } });
          if (existing) { assert((existing.metadata as { digest?: string })?.digest === digest, "Existing partnership plan differs"); return; }
          const rows = await tx.technicianShopAffiliation.findMany({ where: { technicianProfileId: { in: [...profileByEmail.values()] }, shopId: { not: shopId }, relationshipType: "EXCLUSIVE", activeKey: { not: null }, endsAt: null, deletedAt: null, workStatus: { not: "ENDED" } }, select: { id: true, updatedById: true, shop: { select: { owner: { select: { isTestAccount: true } } } } } });
          assert(rows.every(row => row.shop.owner?.isTestAccount), "Only test-owned shop partnerships can be prepared");
          const previous = rows.map(({ id, updatedById }) => ({ id, updatedById }));
          await tx.technicianShopAffiliation.updateMany({ where: { id: { in: rows.map(row => row.id) } }, data: { relationshipType: "PARTNER", updatedById: account.id } });
          await tx.auditLog.create({ data: { actorId: account.id, action, targetType: "shop", targetId: shopId, metadata: { digest, previous, reason: "Prepare existing test staff for shared shop staffing while retaining original affiliations and bookings" } } });
        }, { timeout: 120000, isolationLevel: "ReadCommitted" });
      }
      if (process.argv.includes("--rollback")) {
        assert(!process.argv.includes("--apply-contacts") && !process.argv.includes("--apply-schedules"), "Rollback cannot be combined with apply");
        const audits = await prisma.auditLog.findMany({ where: { actorId: account.id, action: { startsWith: namespace }, deletedAt: null }, orderBy: { id: "desc" } });
        audits.sort((a, b) => Number(a.action.endsWith(".partnerships")) - Number(b.action.endsWith(".partnerships")) || b.id - a.id);
        for (const audit of audits) {
          const metadata = audit.metadata as { digest: string; createdIds?: number[]; availabilityIds?: number[]; slotIds?: number[]; previous?: Array<{ id: number; updatedById: number | null }> };
          assert(metadata.digest === digest, "Rollback plan mismatch");
          await prisma.$transaction(async tx => {
            for (const id of [...profileByEmail.values()].sort((a, b) => a - b)) await tx.$queryRaw`SELECT id FROM technician_profiles WHERE id = ${id} FOR UPDATE`;
            const currentAudit = await tx.auditLog.findUnique({ where: { id: audit.id }, select: { deletedAt: true } });
            if (!currentAudit || currentAudit.deletedAt) return;
            const deletedAt = new Date();
            if (metadata.slotIds?.length) {
              const used = await tx.scheduleSlot.findFirst({ where: { id: { in: metadata.slotIds }, OR: [{ bookingOrders: { some: {} } }, { exchangeClaims: { some: {} } }, { exchangeMatchParticipants: { some: {} } }] }, select: { id: true } });
              assert(!used, "Rollback refused: a generated slot has downstream business records");
              await tx.scheduleSlot.updateMany({ where: { id: { in: metadata.slotIds } }, data: { deletedAt } });
            }
            if (metadata.availabilityIds?.length) await tx.availability.updateMany({ where: { id: { in: metadata.availabilityIds } }, data: { deletedAt, isActive: false } });
            if (audit.action.endsWith(".contacts")) await tx.contact.updateMany({ where: { id: { in: metadata.createdIds ?? [] }, source: namespace }, data: { deletedAt } });
            if (audit.action.endsWith(".staff")) await tx.technicianShopAffiliation.updateMany({ where: { id: { in: metadata.createdIds ?? [] }, createdById: account.id }, data: { deletedAt, activeKey: null, workStatus: "ENDED", endsAt: deletedAt } });
            if (audit.action.endsWith(".partnerships")) {
              for (const previous of metadata.previous ?? []) {
                const row = await tx.technicianShopAffiliation.findUniqueOrThrow({ where: { id: previous.id } });
                assert(row.relationshipType === "PARTNER" && row.updatedById === account.id && !row.deletedAt && !row.endsAt, "Partnership changed after preparation; rollback refused");
                const other = await tx.technicianShopAffiliation.findFirst({ where: { technicianProfileId: row.technicianProfileId, id: { not: row.id }, activeKey: { not: null }, endsAt: null, deletedAt: null, workStatus: { not: "ENDED" } }, select: { id: true } });
                assert(!other, "Cannot restore exclusive affiliation while another partnership remains");
                await tx.technicianShopAffiliation.update({ where: { id: row.id }, data: { relationshipType: "EXCLUSIVE", updatedById: previous.updatedById } });
              }
            }
            await tx.auditLog.update({ where: { id: audit.id }, data: { deletedAt, metadata: { ...metadata, rolledBackAt: deletedAt.toISOString() } } });
            await tx.auditLog.create({ data: { actorId: account.id, action: "test_dataset.rollback", targetType: "audit_log", targetId: audit.id, metadata: { namespace, digest } } });
          }, { timeout: 120000, isolationLevel: "ReadCommitted" });
        }
      }
      if (process.argv.includes("--apply-contacts")) {
        await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${account.id} FOR UPDATE`;
          const already = await tx.auditLog.findFirst({ where: { actorId: account.id, action: `${namespace}.contacts`, deletedAt: null } });
          if (already) { assert((already.metadata as { digest?: string })?.digest === digest, "Existing dataset plan differs"); return; }
          const createdIds: number[] = [];
          for (const ownIdentity of account.identities) {
            for (const contact of accountPlan.contacts) {
              const user = userByEmail.get(contact.email);
              const identity = user?.identities.find(i => i.type === contact.type);
              assert(user && identity, `Missing ${contact.type} target ${contact.email}`);
              for (const [from, to] of [[ownIdentity, identity], [identity, ownIdentity]]) {
                const existing = await tx.contact.findUnique({ where: { ownerIdentityId_contactIdentityId: { ownerIdentityId: from!.id, contactIdentityId: to!.id } } });
                if (existing) { assert(!existing.deletedAt && !existing.blockedAt, "Preserve deleted/blocked contact: select another target before applying"); continue; }
                const row = await tx.contact.create({ data: { ownerUserId: from!.userId, ownerIdentityId: from!.id, contactUserId: to!.userId, contactIdentityId: to!.id, source: namespace } });
                createdIds.push(row.id);
              }
            }
          }
          await tx.auditLog.create({ data: { actorId: account.id, action: `${namespace}.contacts`, targetType: "user", targetId: account.id, metadata: { digest, createdIds } } });
        }, { timeout: 120000, isolationLevel: "ReadCommitted" });
      }
      if (process.argv.includes("--apply-schedules")) {
        await prisma.$transaction(async tx => {
          for (const id of [...profileByEmail.values()].sort((a, b) => a - b)) await tx.$queryRaw`SELECT id FROM technician_profiles WHERE id = ${id} FOR UPDATE`;
          const exclusive = await tx.technicianShopAffiliation.findFirst({ where: { technicianProfileId: { in: [...profileByEmail.values()] }, shopId: { not: shopId }, relationshipType: "EXCLUSIVE", activeKey: { not: null }, endsAt: null, deletedAt: null, workStatus: { not: "ENDED" } }, select: { id: true } });
          assert(!exclusive, "Other-shop exclusive affiliation conflicts with staffing plan");
          const existing = await tx.auditLog.findFirst({ where: { actorId: account.id, action: `${namespace}.staff`, deletedAt: null } });
          if (existing) { assert((existing.metadata as { digest?: string })?.digest === digest, "Existing staff plan differs"); return; }
          const createdIds: number[] = [];
          for (const user of staff) {
            const technicianProfileId = user.technicianProfile!.id;
            const found = await tx.technicianShopAffiliation.findFirst({ where: { technicianProfileId, shopId, deletedAt: null } });
            if (found) { assert(found.workStatus === "ACTIVE", "Inactive affiliation must be reviewed"); continue; }
            const row = await tx.technicianShopAffiliation.create({ data: { technicianProfileId, shopId, relationshipType: "PARTNER", workStatus: "ACTIVE", startsAt: new Date(`${startDate}T00:00:00+09:00`), activeKey: `${namespace}:${shopId}:${technicianProfileId}`, createdById: account.id, updatedById: account.id } });
            createdIds.push(row.id);
          }
          await tx.auditLog.create({ data: { actorId: account.id, action: `${namespace}.staff`, targetType: "shop", targetId: shopId, metadata: { digest, createdIds } } });
        }, { timeout: 120000, isolationLevel: "ReadCommitted" });
        const days = [...new Set(accountPlan.shifts.map(shift => shift.date))];
        for (const [dayIndex, date] of days.entries()) {
          const action = `${namespace}.day.${date}`;
          await prisma.$transaction(async tx => {
            const shifts = accountPlan.shifts.filter(shift => shift.date === date);
            assert(shifts.length === 30 && new Set(shifts.map(s => s.email)).size === 30, "Invalid daily staffing");
            const profileIds = shifts.map(s => profileByEmail.get(s.email)!);
            // Serialize against booking/schedule mutations on the same owners.
            for (const id of [...profileIds].sort((a, b) => a - b)) await tx.$queryRaw`SELECT id FROM technician_profiles WHERE id = ${id} FOR UPDATE`;
            const existing = await tx.auditLog.findFirst({ where: { actorId: account.id, action, deletedAt: null } });
            if (existing) { assert((existing.metadata as { digest?: string })?.digest === digest, "Existing schedule plan differs"); return; }
            const dayStart = new Date(`${date}T00:00:00+09:00`);
            const dayEnd = new Date(dayStart.getTime() + 86400000);
            const conflicts = await tx.bookingOrder.findMany({ where: { shopId: { not: shopId }, technicianProfileId: { in: profileIds }, status: { in: ["CONFIRMED", "IN_SERVICE"] }, deletedAt: null, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } }, select: { technicianProfileId: true, startsAt: true, endsAt: true } });
            const availabilityIds: number[] = [];
            const slotIds: number[] = [];
            for (const shift of shifts) {
              const technicianProfileId = profileByEmail.get(shift.email)!;
              const startsAt = new Date(shift.startsAt), endsAt = new Date(shift.endsAt);
              assert(!conflicts.some(b => b.technicianProfileId === technicianProfileId && b.startsAt < endsAt && b.endsAt > startsAt), `Booking conflict on ${date}`);
              const existingSlots = await tx.scheduleSlot.findMany({ where: { shopId, technicianProfileId, deletedAt: null, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } }, select: { startsAt: true, endsAt: true } });
              const availability = await tx.availability.create({ data: { shopId, technicianProfileId, startsAt, endsAt, capacity: 1, sourceType: "SHOP", visibility: "SHOP_ONLY", isActive: true } });
              availabilityIds.push(availability.id);
              const newSlots = Array.from({ length: 8 }, (_, hour) => ({ availabilityId: availability.id, shopId, technicianProfileId, serviceId: service.id, startsAt: new Date(startsAt.getTime() + hour * 3600000), endsAt: new Date(startsAt.getTime() + (hour + 1) * 3600000), capacity: 1, bookedCount: 0, status: "AVAILABLE" as const }))
                .filter(slot => !existingSlots.some(existing => existing.startsAt < slot.endsAt && existing.endsAt > slot.startsAt));
              if (newSlots.length) await tx.scheduleSlot.createMany({ data: newSlots });
            }
            const slots = await tx.scheduleSlot.findMany({ where: { availabilityId: { in: availabilityIds } }, select: { id: true } });
            slotIds.push(...slots.map(slot => slot.id));
            await tx.auditLog.create({ data: { actorId: account.id, action, targetType: "shop", targetId: shopId, metadata: { digest, availabilityIds, slotIds } } });
          }, { timeout: 120000, isolationLevel: "ReadCommitted" });
          if (dayIndex % 30 === 0 || dayIndex === days.length - 1) console.log(JSON.stringify({ account: account.email, daysApplied: dayIndex + 1, totalDays: days.length }));
        }
      }
      const contactCounts = [];
      for (const identity of account.identities) {
        const contacts = await prisma.contact.findMany({ where: { ownerIdentityId: identity.id, deletedAt: null, blockedAt: null }, select: { contactIdentity: { select: { type: true } } } });
        contactCounts.push({ type: identity.type, counts: Object.fromEntries(identityTypes.map(type => [type, contacts.filter(c => c.contactIdentity.type === type).length])) });
      }
      const appliedDays = await prisma.auditLog.count({ where: { actorId: account.id, action: { startsWith: `${namespace}.day.` }, deletedAt: null } });
      console.log(JSON.stringify({ target, account: account.email, shop, service, digest, plannedStaff: staff.length, plannedContactsPerIdentity: accountPlan.contacts.length, plannedShifts: accountPlan.shifts.length, plannedSlots: accountPlan.shifts.length * 8, appliedDays, contactCounts }));
    }
  } finally { await disconnectPrisma(); }
};
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Provisioning failed"); process.exitCode = 1; });
