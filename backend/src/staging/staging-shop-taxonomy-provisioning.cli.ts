import { seedShopServiceTaxonomyCatalog } from "../bootstrap/shop-service-taxonomy-bootstrap";
import { disconnectPrisma, prisma } from "../prisma/client";
import { parseStagingShopTaxonomyProvisioningConfig } from "./staging-shop-taxonomy-provisioning";

const main = async (): Promise<void> => {
  const config = parseStagingShopTaxonomyProvisioningConfig(process.env);
  const result = await prisma.$transaction(
    async (tx) => {
      const actor = await tx.user.findFirst({
        where: {
          email: config.actorEmail,
          isActive: true,
          deletedAt: null,
          userRoles: { some: { role: { code: "admin", deletedAt: null }, deletedAt: null } }
        },
        select: { id: true }
      });
      if (!actor) throw new Error("STAGING_SHOP_TAXONOMY_ACTOR_NOT_FOUND");

      const before = await tx.category.count({ where: { isActive: true, deletedAt: null } });
      await seedShopServiceTaxonomyCatalog(tx);
      const [categories, keywords] = await Promise.all([
        tx.category.count({ where: { isActive: true, deletedAt: null } }),
        tx.businessKeyword.count({ where: { isActive: true, deletedAt: null } })
      ]);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staging.shop_taxonomy.provision",
          targetType: "ShopServiceTaxonomy",
          metadata: { beforeCategories: before, categories, keywords }
        }
      });
      return { beforeCategories: before, categories, keywords };
    },
    { maxWait: 10_000, timeout: 120_000 }
  );
  console.log(JSON.stringify({ status: "ok", ...result }));
};

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma();
  });
