import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { provisionLegalContractCatalog } from "../src/bootstrap/legal-contract-catalog-bootstrap";
import { parseStagingLegalContractProvisioningConfig } from "../src/staging/staging-legal-contract-provisioning";

describe("staging legal contract provisioning", () => {
  const validEnv = {
    NODE_ENV: "production",
    DEPLOY_ENV: "staging",
    ALLOW_STAGING_LEGAL_CONTRACT_PROVISIONING: "true",
    DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_staging",
    ADMIN_DEFAULT_EMAIL: "admin@lifedance.com"
  } as NodeJS.ProcessEnv;

  it("accepts only the explicit staging database boundary", () => {
    expect(parseStagingLegalContractProvisioningConfig(validEnv)).toEqual({
      databaseHost: "mysql",
      databaseName: "needo_staging",
      actorEmail: "admin@lifedance.com"
    });

    for (const override of [
      { NODE_ENV: "development" },
      { DEPLOY_ENV: "production" },
      { ALLOW_STAGING_LEGAL_CONTRACT_PROVISIONING: "false" },
      { DATABASE_URL: "mysql://needo:secret@mysql:3306/needo_prod" },
      { DATABASE_URL: "mysql://needo:secret@127.0.0.1:3306/needo_staging" },
      { ADMIN_DEFAULT_EMAIL: undefined }
    ]) {
      expect(() =>
        parseStagingLegalContractProvisioningConfig({ ...validEnv, ...override })
      ).toThrow();
    }
  });

  it("ships the audited command in the production runtime", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };
    const cliSource = readFileSync(
      resolve(process.cwd(), "src/staging/staging-legal-contract-provisioning.cli.ts"),
      "utf8"
    );

    expect(packageJson.scripts["provision:staging-legal-contracts"]).toBe(
      "node dist/staging/staging-legal-contract-provisioning.cli.js"
    );
    expect(cliSource).toContain("provisionLegalContractCatalog");
    expect(cliSource).toContain("staging.legal_contracts.provision");
    expect(cliSource).toContain("actorId: actor.id");
  });

  it("creates both contract documents and all six locale releases", async () => {
    let documentId = 0;
    let releaseId = 0;
    const auditCreate = jest.fn(async () => ({}));
    const tx = {
      legalDocument: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: ++documentId,
          ...data
        }))
      },
      legalDocumentDraft: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({}))
      },
      legalDocumentRelease: {
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: ++releaseId,
          publicId: `release-${releaseId}`,
          ...data
        }))
      },
      auditLog: { create: auditCreate }
    } as unknown as Prisma.TransactionClient;

    await expect(provisionLegalContractCatalog(tx, 7)).resolves.toEqual({
      documents: 2,
      releases: 6,
      createdDocuments: 2,
      createdReleases: 6
    });
    expect(tx.legalDocument.create).toHaveBeenCalledTimes(2);
    expect(tx.legalDocumentDraft.create).toHaveBeenCalledTimes(6);
    expect(tx.legalDocumentRelease.create).toHaveBeenCalledTimes(6);
    expect(auditCreate).toHaveBeenCalledTimes(8);
  });

  it("fails closed instead of overwriting a conflicting contract catalog", async () => {
    const tx = {
      legalDocument: {
        findFirst: jest.fn(async () => ({
          id: 9,
          name: "unexpected",
          internalPath: "/unexpected",
          displayLocations: [],
          isEnabled: false
        }))
      }
    } as unknown as Prisma.TransactionClient;

    await expect(provisionLegalContractCatalog(tx, 7)).rejects.toThrow(
      "STAGING_LEGAL_CONTRACT_DOCUMENT_CONFLICT:merchant-agreement"
    );
  });
});
