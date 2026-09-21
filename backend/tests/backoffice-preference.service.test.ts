import { describe, expect, it, jest } from "@jest/globals";
import { BackofficePreferenceService } from "../src/services/backoffice-preference.service";
import type { BackofficePreferenceRepositoryPort } from "../src/repositories/backoffice-preference.repository";

const actor = { userId: 7 } as never;
const context = { ip: "127.0.0.1", userAgent: "test" };

describe("BackofficePreferenceService", () => {
  it.each<["local" | "test" | "staging" | "prod", boolean]>([
    ["local", true],
    ["test", true],
    ["staging", true],
    ["prod", false]
  ])("defaults %s visibility to %s when no preference exists", async (environment, expected) => {
    const repository = {
      findByUserId: jest.fn(async () => null),
      update: jest.fn()
    } as unknown as BackofficePreferenceRepositoryPort;
    await expect(new BackofficePreferenceService(repository, environment).getEffective(7))
      .resolves.toEqual({ showTestNdpData: expected, source: "environment_default" });
  });

  it("returns and updates an explicit preference for only the current admin", async () => {
    const repository = {
      findByUserId: jest.fn(async () => ({ showTestNdpData: false })),
      update: jest.fn(async () => ({ showTestNdpData: true }))
    } as unknown as BackofficePreferenceRepositoryPort;
    const service = new BackofficePreferenceService(repository, "staging");

    await expect(service.getEffective(7)).resolves.toEqual({
      showTestNdpData: false,
      source: "explicit"
    });
    await expect(service.update(actor, context, { showTestNdpData: true })).resolves.toEqual({
      showTestNdpData: true,
      source: "explicit"
    });
    expect(repository.update).toHaveBeenCalledWith({
      userId: 7,
      showTestNdpData: true,
      context
    });
  });
});
