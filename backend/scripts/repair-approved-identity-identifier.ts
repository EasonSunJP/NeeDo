import { assertNonProductionLocalDatabase } from "./backfill-system-settings";

const main = async () => {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--application-id" || !/^\d+$/.test(args[1]))
    throw new Error("Usage: repair-approved-identity-identifier --application-id ID");
  const applicationId = Number(args[1]);
  if (!Number.isSafeInteger(applicationId) || applicationId < 1)
    throw new Error("Invalid application ID");
  const target = assertNonProductionLocalDatabase();
  const { prisma } = await import("../src/prisma/client");
  const { repairApprovedApplicationIdentifier } =
    await import("../src/repositories/identity-activation-identifier-repair.repository");
  try {
    console.log(
      JSON.stringify({
        databaseTarget: target.maskedDatabaseTarget,
        result: await repairApprovedApplicationIdentifier(prisma, applicationId)
      })
    );
  } finally {
    await prisma.$disconnect();
  }
};
void main().catch(() => {
  console.error(
    "Approved identity identifier repair failed; no approval or role changes were made."
  );
  process.exitCode = 1;
});
