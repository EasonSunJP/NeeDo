import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "cloudformation.yml"), "utf8");

describe("AWS Staging CloudFormation contract", () => {
  it("pins the approved region-compatible ARM environment", () => {
    expect(source).toContain("al2023-ami-kernel-default-arm64");
    expect(source).toContain("InstanceType: t4g.large");
    expect(source).toContain("VolumeSize: 30");
    expect(source).toContain("Size: 70");
    expect(source.match(/Encrypted: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain("HttpTokens: required");
  });

  it("has no SSH key and exposes only HTTP and HTTPS", () => {
    expect(source).not.toMatch(/KeyName:/);
    const ingressSource = source
      .split("SecurityGroupIngress:")[1]
      .split("SecurityGroupEgress:")[0];
    const ingress = [...ingressSource.matchAll(/FromPort: (\d+)/g)].map(
      (match) => Number(match[1])
    );
    expect(new Set(ingress)).toEqual(new Set([80, 443]));
    expect(source).not.toMatch(/FromPort: (22|3000|3306|6379)/);
  });

  it("keeps data and object storage encrypted and recoverable", () => {
    expect(source).toContain("DeletionPolicy: Snapshot");
    expect(source).toContain("UpdateReplacePolicy: Snapshot");
    expect(source.match(/BlockPublicAcls: true/g)?.length).toBe(2);
    expect(source.match(/Status: Enabled/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/DeletionPolicy: Retain/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("creates an empty secret and never embeds a value", () => {
    expect(source).toContain("Type: AWS::SecretsManager::Secret");
    expect(source).not.toMatch(/SecretString:|GenerateSecretString:/);
    expect(source).not.toMatch(/JWT_|DATABASE_URL|REDIS_PASSWORD|password/i);
  });

  it("creates percentage budget alerts matching 15k, 18k, and 20k intent", () => {
    expect(source).toContain("Type: AWS::Budgets::Budget");
    expect(source).toContain("Amount: !Ref BudgetAmount");
    expect(source).toContain("Unit: !Ref BudgetUnit");
    for (const threshold of [75, 90, 100]) {
      expect(source).toContain(`Threshold: ${threshold}`);
    }
    expect(source).toContain("ThresholdType: PERCENTAGE");
  });

  it("contains host bootstrap only and excludes application deployment", () => {
    expect(source.match(/Type: AWS::SSM::Document/g)).toHaveLength(2);
    expect(source).toContain("/srv/needo/media/customer-avatars");
    expect(source).toContain("findmnt");
    expect(source).not.toMatch(/docker compose|prisma|seed|migrate deploy|certbot|nginx|Route53|AWS::Route53/i);
  });
});
