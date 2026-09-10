import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";

const main = async (): Promise<void> => {
  const envFile = process.env.ENV_FILE || ".env.dev";
  if (!existsSync(envFile)) throw new Error(`environment file was not found: ${envFile}`);
  process.env.ENV_FILE = envFile;
  loadDotenv({ path: envFile });

  const [{ prisma, disconnectPrisma }, provisioning] = await Promise.all([
    import("../src/prisma/client"),
    import("../src/simulation/lifedance-admin2-provisioning")
  ]);
  provisioning.assertLocalAdmin2ProvisioningTarget(process.env);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.findUnique({
          where: { email: provisioning.LIFEDANCE_ADMIN2_PLAN.email },
          select: { id: true, isActive: true, deletedAt: true }
        });
        if (!user?.isActive || user.deletedAt) {
          throw new Error("Active LifeDance admin2 account was not found.");
        }
        const [admin, shop, technicianProfile] = await Promise.all([
          tx.user.findUnique({
            where: { email: "admin@lifedance.com" },
            select: { id: true, isActive: true, deletedAt: true }
          }),
          tx.shop.findFirst({
            where: {
              ownerUserId: user.id,
              name: provisioning.LIFEDANCE_ADMIN2_PLAN.shopName,
              deletedAt: null
            },
            select: { id: true }
          }),
          tx.technicianProfile.findUnique({
            where: { userId: user.id },
            select: { id: true, deletedAt: true }
          })
        ]);
        if (!admin?.isActive || admin.deletedAt) {
          throw new Error("Active LifeDance administrator was not found.");
        }
        if (!shop) throw new Error("LifeDance admin2 shop was not found.");
        if (!technicianProfile || technicianProfile.deletedAt) {
          throw new Error("LifeDance admin2 technician profile was not found.");
        }

        const compensationProfileId =
          await provisioning.ensureLifeDanceAdmin2CompensationProfile(tx, {
            shopId: shop.id,
            technicianProfileId: technicianProfile.id,
            adminUserId: admin.id
          });
        const inventory = await provisioning.ensureLifeDanceAdmin2BookingInventory(tx, {
          shopId: shop.id,
          technicianProfileId: technicianProfile.id
        });
        const { verifyShopServiceLocationInTransaction } = await import(
          "../src/repositories/shop-service-location.repository"
        );
        await verifyShopServiceLocationInTransaction(tx, {
          shopId: shop.id,
          verifiedById: admin.id,
          serviceLocation: provisioning.LIFEDANCE_ADMIN2_PLAN.serviceLocation,
          auditAction: "seed.lifedance_admin2.service_location.verify",
          auditMetadata: { repair: "booking_inventory" }
        });
        await tx.auditLog.create({
          data: {
            actorId: admin.id,
            action: "seed.lifedance_admin2.repair_booking_inventory",
            targetType: "Shop",
            targetId: shop.id,
            metadata: {
              userId: user.id,
              technicianProfileId: technicianProfile.id,
              compensationProfileId,
              serviceId: inventory.serviceId,
              availableSlotCount: inventory.availableSlotCount
            }
          }
        });

        return {
          userId: user.id,
          shopId: shop.id,
          technicianProfileId: technicianProfile.id,
          compensationProfileId,
          ...inventory
        };
      },
      { maxWait: 20_000, timeout: 60_000 }
    );

    console.log(JSON.stringify({ status: "ok", ...result }));
  } finally {
    await disconnectPrisma();
  }
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
