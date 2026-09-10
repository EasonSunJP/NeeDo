import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_LEGAL_DOCUMENT_SOURCES,
  assertSystemSettingsDatabaseTarget
} from "../scripts/backfill-system-settings";
import { RollbackVerifiedSystemSettingsFlow } from "../scripts/check-system-settings-flow";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const read = (name: string) => readFileSync(join(root, "scripts", name), "utf8");

describe("system settings formal data tooling", () => {
  it("wires explicit backfill and rollback-contained checker commands", () => {
    expect(packageJson.scripts["backfill:system-settings"]).toBe(
      "tsx scripts/backfill-system-settings.ts"
    );
    expect(packageJson.scripts["check:system-settings-flow"]).toBe(
      "tsx scripts/check-system-settings-flow.ts"
    );
    expect(new RollbackVerifiedSystemSettingsFlow()).toBeInstanceOf(Error);
  });

  it("guards the backfill and imports every approved source without fallback text", () => {
    const source = read("backfill-system-settings.ts");
    expect(source).toContain("assertNonProductionLocalDatabase");
    expect(source).toContain("legalTermsDocuments");
    expect(source).toContain("legalPrivacyDocuments");
    expect(source).toContain("LEGAL_DOCUMENT_BOOTSTRAP");
    expect(source).toContain('"terms-of-use"');
    expect(source).toContain('"privacy-policy"');
    expect(source).toContain('"merchant-agreement"');
    expect(source).toContain('"affiliate-agreement"');
    for (const slug of [
      "technician-agreement",
      "ekyc-consent",
      "cancellation-refund-policy",
      "ndp-rules",
      "community-guidelines",
      "specified-commercial-transactions-disclosure"
    ]) {
      expect(source).toContain(`"${slug}"`);
    }
    expect(source).toContain('status: "conflict"');
    expect(source).not.toContain("upsert(");
  });

  it("soft-retires only the exact empty disabled legacy placeholders", () => {
    const source = read("backfill-system-settings.ts");
    for (const slug of [
      "other-rules-and-guides",
      "cancellation-policy",
      "service-provider-guide"
    ]) {
      expect(source).toContain(`slug: "${slug}"`);
    }
    expect(source).toContain("LEGACY_EMPTY_LEGAL_DOCUMENTS");
    expect(source).toContain('action: "system.legal_document.legacy_placeholder_retired"');
    expect(source).toContain("drafts: { where: { deletedAt: null } }");
    expect(source).toContain("releases: { where: { deletedAt: null } }");
    expect(source).toContain("lockVersion: { increment: 1 }");
    expect(source).toContain('status: "retired"');
    expect(source).not.toMatch(/legalDocument\.delete(?:Many)?\(/u);
  });

  it("keeps the checker local-only, rollback-contained, and residue-aware", () => {
    const source = read("check-system-settings-flow.ts");
    expect(source).toContain("assertNonProductionLocalDatabase");
    expect(source).toContain("RollbackVerifiedSystemSettingsFlow");
    expect(source).toContain("error.legal_document.version_conflict");
    expect(source).toContain("SERVER_RETENTION_EXPIRED");
    expect(source).toContain("backoffice:legal-documents:publish");
    expect(source).toContain("marker residue remained after rollback");
    expect(source).not.toMatch(/DELETE\s+FROM/iu);
  });

  it("builds the exact required policy catalog without publishing unreviewed additions", () => {
    const bySlug = new Map(SYSTEM_LEGAL_DOCUMENT_SOURCES.map((source) => [source.slug, source]));
    expect([...bySlug.keys()]).toEqual([
      "terms-of-use",
      "privacy-policy",
      "merchant-agreement",
      "affiliate-agreement",
      "technician-agreement",
      "ekyc-consent",
      "cancellation-refund-policy",
      "ndp-rules",
      "community-guidelines",
      "specified-commercial-transactions-disclosure"
    ]);
    expect(Object.keys(bySlug.get("terms-of-use")?.releases ?? {})).toEqual([
      "zh-CN",
      "zh-TW",
      "ja",
      "en",
      "ko"
    ]);
    expect(Object.keys(bySlug.get("privacy-policy")?.releases ?? {})).toEqual([
      "zh-CN",
      "zh-TW",
      "ja",
      "en",
      "ko"
    ]);
    expect(Object.keys(bySlug.get("merchant-agreement")?.releases ?? {})).toEqual([
      "zh-CN",
      "ja",
      "en"
    ]);
    expect(Object.keys(bySlug.get("affiliate-agreement")?.releases ?? {})).toEqual([
      "zh-CN",
      "ja",
      "en"
    ]);
    expect(bySlug.get("technician-agreement")).toMatchObject({
      internalPath: "/me/identity/technician/apply",
      displayLocations: ["technician-application"],
      isEnabled: false,
      releases: {}
    });
    expect(bySlug.get("ekyc-consent")).toMatchObject({
      internalPath: "/me/settings/verification",
      displayLocations: ["ekyc", "merchant-application", "technician-application", "withdrawal"],
      isEnabled: false,
      releases: {}
    });
    expect(bySlug.get("cancellation-refund-policy")).toMatchObject({
      internalPath: "/orders",
      displayLocations: ["booking-checkout", "order-detail", "cancellation"],
      isEnabled: false,
      releases: {}
    });
    expect(bySlug.get("ndp-rules")).toMatchObject({
      internalPath: "/me/settings/ndp-guide",
      displayLocations: ["ndp-wallet", "booking-checkout", "withdrawal"],
      isEnabled: false,
      releases: {}
    });
    expect(bySlug.get("community-guidelines")).toMatchObject({
      internalPath: "/moments",
      displayLocations: ["social-compose", "social-report"],
      isEnabled: false,
      releases: {}
    });
    expect(bySlug.get("specified-commercial-transactions-disclosure")).toMatchObject({
      internalPath: "/me/settings/about",
      displayLocations: ["paid-service", "membership-purchase", "footer"],
      isEnabled: false,
      releases: {}
    });
  });

  it("rejects remote and production-looking database targets before Prisma is imported", () => {
    expect(() =>
      assertSystemSettingsDatabaseTarget({
        envFile: ".env.dev",
        databaseUrl: "mysql://user:secret@db.example.com:3306/needo_dev"
      })
    ).toThrow("only accepts a local MySQL host");
    expect(() =>
      assertSystemSettingsDatabaseTarget({
        envFile: ".env.dev",
        deployEnvironment: "staging",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo_dev"
      })
    ).toThrow("rejects production and staging runtimes");
    expect(() =>
      assertSystemSettingsDatabaseTarget({
        envFile: ".env.dev",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo_production"
      })
    ).toThrow("rejects production-looking database names");
    expect(
      assertSystemSettingsDatabaseTarget({
        envFile: ".env.dev",
        databaseUrl: "mysql://user:secret@127.0.0.1:3307/needo_formal"
      }).maskedDatabaseTarget
    ).toBe("mysql://127.0.0.1:3307/needo_formal");
  });
});
