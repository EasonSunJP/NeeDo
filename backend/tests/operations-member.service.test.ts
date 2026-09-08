import { OperationsMemberService } from "../src/services/operations-member.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";
const actor: AuthenticatedAccessContext = { userId: 1, email: "admin@example.test", roles: ["admin"], permissions: ["user:create", "user:assign-role"], accessTokenJti: "test", accessTokenExpiresAt: 1, currentIdentityType: "platform", currentIdentityScopeType: "global", currentIdentityScopeId: null };
const body = { username: "Operator", email: "op@example.test", password: "Strong@1234", reason: "Hire" };
it.each([{ currentIdentityType: "shop" }, { currentIdentityScopeType: "shop", currentIdentityScopeId: 4 }, { isReadOnlyMerchantPreview: true }, { permissions: ["user:create"] }])("rejects unauthorized operations creation at the service boundary: %j", async (override) => {
  const createWithAudit = jest.fn();
  await expect(new OperationsMemberService({ createWithAudit }).create(body, { ...actor, ...override }, { ip: "127.0.0.1" })).rejects.toMatchObject({ statusCode: 403 });
  expect(createWithAudit).not.toHaveBeenCalled();
});
