import { provisionLegalContractCatalog } from "../bootstrap/legal-contract-catalog-bootstrap";
import { disconnectPrisma, prisma } from "../prisma/client";
import { parseStagingLegalContractProvisioningConfig } from "./staging-legal-contract-provisioning";

const main = async (): Promise<void> => {
  const config = parseStagingLegalContractProvisioningConfig(process.env);
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
      if (!actor) throw new Error("STAGING_LEGAL_CONTRACT_ACTOR_NOT_FOUND");

      const provisioned = await provisionLegalContractCatalog(tx, actor.id);
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "staging.legal_contracts.provision",
          targetType: "LegalDocument",
          metadata: { ...provisioned }
        }
      });
      return provisioned;
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
