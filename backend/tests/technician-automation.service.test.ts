import type { AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  TechnicianAutomationService,
  type TechnicianAutomationRepositoryPort
} from "../src/services/technician-automation.service";
import { defaultTechnicianAutomationRules } from "../src/validators/technician-automation.validator";

const access = {
  userId: 7,
  currentIdentityId: 17,
  currentIdentityType: "technician",
  currentIdentityScopeType: "technician_profile",
  currentIdentityScopeId: 31,
  permissions: ["technician:automation-settings:read", "technician:automation-settings:write"]
} as AuthenticatedAccessContext;

const repository = (): jest.Mocked<TechnicianAutomationRepositoryPort> => ({
  findSetting: jest.fn(async (technicianProfileId: number, kind: "booking" | "request") => {
    void technicianProfileId;
    void kind;
    return null;
  }),
  saveSetting: jest.fn(async (input) => ({
    outcome: "ok" as const,
    setting: {
      id: 11,
      technicianProfileId: input.technicianProfileId,
      kind: input.kind,
      enabled: input.enabled,
      rules: input.rules,
      version: input.expectedVersion,
      updatedAt: new Date("2026-09-09T00:00:00.000Z")
    }
  })),
  listContacts: jest.fn(async (input: { ownerIdentityId: number; page: number; pageSize: number; search?: string }) => {
    void input;
    return { list: [], total: 0, page: 1, page_size: 20 };
  })
});

describe("TechnicianAutomationService", () => {
  it("returns a disabled server-shaped default without persisting on read", async () => {
    const repo = repository();
    const result = await new TechnicianAutomationService(repo).getSetting(access, "booking");
    expect(result).toMatchObject({
      kind: "booking",
      enabled: false,
      entitled: true,
      testBadgeEnabled: true,
      version: 1,
      rules: defaultTechnicianAutomationRules("booking")
    });
    expect(repo.saveSetting).not.toHaveBeenCalled();
  });

  it.each(["booking", "request"] as const)("reads existing %s settings with bank transfer without changing them", async (kind) => {
    const repo = repository();
    const rules = {
      ...defaultTechnicianAutomationRules(kind),
      paymentMethods: ["onsite", "card", "ndp", "bank_transfer", "other"]
    };
    repo.findSetting.mockResolvedValueOnce({
      id: 11,
      technicianProfileId: 31,
      kind,
      enabled: true,
      rules,
      version: 3,
      updatedAt: new Date("2026-09-09T00:00:00.000Z")
    });
    await expect(new TechnicianAutomationService(repo).getSetting(access, kind))
      .resolves.toMatchObject({ enabled: true, rules });
    expect(repo.saveSetting).not.toHaveBeenCalled();
  });

  it("derives entitlement from the backend write permission", async () => {
    const repo = repository();
    const service = new TechnicianAutomationService(repo);
    await expect(service.getSetting({ ...access, permissions: ["technician:automation-settings:read"] }, "booking"))
      .resolves.toMatchObject({ entitled: false, enabled: false });
    await expect(service.updateSetting(
      { ...access, permissions: ["technician:automation-settings:read"] },
      "booking",
      { enabled: true, expectedVersion: 1, rules: defaultTechnicianAutomationRules("booking") },
      { ip: "127.0.0.1" }
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.saveSetting).not.toHaveBeenCalled();
  });

  it("persists only the current technician profile with optimistic version and audit context", async () => {
    const repo = repository();
    await new TechnicianAutomationService(repo).updateSetting(
      access,
      "request",
      { enabled: true, expectedVersion: 1, rules: defaultTechnicianAutomationRules("request") },
      { ip: "127.0.0.1", userAgent: "jest" }
    );
    expect(repo.saveSetting).toHaveBeenCalledWith(expect.objectContaining({
      technicianProfileId: 31,
      actorUserId: 7,
      kind: "request",
      enabled: true,
      expectedVersion: 1,
      audit: expect.objectContaining({ action: "technician.automation_settings.update" })
    }));
  });

  it("rejects non-technician identity scope and maps version conflicts", async () => {
    const repo = repository();
    const service = new TechnicianAutomationService(repo);
    await expect(service.getSetting({ ...access, currentIdentityType: "customer" }, "booking"))
      .rejects.toMatchObject({ statusCode: 403 });
    repo.saveSetting.mockResolvedValueOnce({ outcome: "version_conflict", currentVersion: 4 });
    await expect(service.updateSetting(
      access,
      "booking",
      { enabled: true, expectedVersion: 2, rules: defaultTechnicianAutomationRules("booking") },
      { ip: "127.0.0.1", userAgent: "jest" }
    )).rejects.toMatchObject({ statusCode: 409, data: { currentVersion: 4 } });
  });

  it("lists only current-identity IM friends with bounded pagination", async () => {
    const repo = repository();
    await new TechnicianAutomationService(repo).listContacts(access, { page: 2, page_size: 10, search: "山田" });
    expect(repo.listContacts).toHaveBeenCalledWith({
      ownerIdentityId: 17,
      page: 2,
      pageSize: 10,
      search: "山田"
    });
  });
});
