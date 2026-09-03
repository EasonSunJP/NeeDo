import { describe, expect, it } from "vitest";
import {
  maskEmail,
  parseAwsStagingArgs,
  resolveAwsStagingConfig
} from "./aws-staging-config.mjs";

const validInput = {
  profile: "needo-staging-deployer",
  accountId: "123456789012",
  region: "ap-northeast-1",
  owner: "needo",
  alertEmail: "ops@example.com",
  budgetAmount: "20000",
  budgetUnit: "JPY"
};

describe("AWS Staging configuration", () => {
  it("normalizes the approved environment without converting money", () => {
    expect(resolveAwsStagingConfig(validInput)).toEqual({
      alertEmail: "ops@example.com",
      budgetAmount: "20000",
      budgetUnit: "JPY",
      accountId: "123456789012",
      environment: "staging",
      owner: "needo",
      profile: "needo-staging-deployer",
      region: "ap-northeast-1",
      stackName: "needo-staging-infrastructure",
      templatePath: expect.stringMatching(
        /deploy\/aws-staging\/cloudformation\.yml$/
      )
    });
  });

  it.each([
    [{ ...validInput, accountId: "" }, "account ID"],
    [{ ...validInput, accountId: "123" }, "account ID"],
    [{ ...validInput, region: "us-east-1" }, "ap-northeast-1"],
    [{ ...validInput, profile: "default" }, "profile"],
    [{ ...validInput, alertEmail: "not-an-email" }, "email"],
    [{ ...validInput, budgetAmount: "0" }, "budget amount"],
    [{ ...validInput, budgetAmount: "20,000" }, "budget amount"],
    [{ ...validInput, budgetUnit: "yen" }, "currency"]
  ])("rejects unsafe input %#", (input, expected) => {
    expect(() => resolveAwsStagingConfig(input)).toThrow(expected);
  });

  it("requires each mutating argument explicitly", () => {
    expect(
      parseAwsStagingArgs([
        "--profile", "needo-staging-deployer",
        "--account-id", "123456789012",
        "--alert-email", "ops@example.com",
        "--budget-amount", "20000",
        "--budget-unit", "JPY"
      ])
    ).toMatchObject(validInput);
    expect(() => parseAwsStagingArgs([])).toThrow("--account-id");
  });

  it("masks alert addresses in evidence", () => {
    expect(maskEmail("operations@example.com")).toBe("o***@example.com");
  });
});
