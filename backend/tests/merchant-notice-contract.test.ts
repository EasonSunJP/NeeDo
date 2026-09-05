import { merchantNoticeCreateBodySchema, officialNoticeCreateBodySchema } from "../src/validators/official-notice.validator";
import {
  resolveNoticeIssuerScope,
  resolveNoticeReadScope
} from "../src/services/official-notice-scope";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const body = {
  sourceLocale: "ja", level: "important", title: "営業時間変更", summary: "お知らせ",
  blocks: [{ id: "p-1", type: "paragraph", content: "本文" }],
  audience: { type: "shop_employees" }, sendMode: "now", scheduledAt: null,
  idempotencyKey: "merchant-notice-contract"
};
const actor = {
  userId: 7, currentIdentityId: 17, currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop", currentIdentityScopeId: 11
} as AuthenticatedAccessContext;

describe("merchant notice publication contract", () => {
  it.each(["shop_card_holders", "shop_employees", "shop_technicians"])("accepts only server-resolved %s", (type) => {
    expect(merchantNoticeCreateBodySchema.parse({ ...body, audience: { type } }).audience).toEqual({ type });
  });
  it.each([
    { type: "all" }, { type: "identity_types", identityTypes: ["customer"] },
    { type: "exact_users", userIds: [1] }, { type: "shop_employees", shopId: 12 },
    { type: "shop_card_holders", userIds: [1] }
  ])("rejects injected audience %j", (audience) => {
    expect(merchantNoticeCreateBodySchema.safeParse({ ...body, audience }).success).toBe(false);
  });
  it("rejects caller-supplied issuer and shop fields and keeps platform validation separate", () => {
    for (const field of ["issuerType", "issuerShopId", "shopId", "actorIdentityId"])
      expect(merchantNoticeCreateBodySchema.safeParse({ ...body, [field]: 12 }).success).toBe(false);
    expect(officialNoticeCreateBodySchema.safeParse(body).success).toBe(false);
  });
  it("resolves direct-shop and selected merchant-account scopes from authenticated context", () => {
    expect(resolveNoticeIssuerScope(actor, "shop")).toEqual({
      type: "shop", shopId: 11, actorUserId: 7, actorIdentityId: 17
    });
    expect(resolveNoticeIssuerScope({ ...actor, currentIdentityScopeType: "merchant_account",
      currentIdentityScopeId: 3, selectedMerchantShopId: 12 }, "shop")).toMatchObject({ shopId: 12 });
  });
  it("forbids read-only preview and non-merchant identities from publishing", () => {
    expect(() => resolveNoticeIssuerScope({ ...actor, isReadOnlyMerchantPreview: true,
      merchantPreviewShopId: 11 }, "shop")).toThrow();
    expect(() => resolveNoticeIssuerScope({ ...actor, currentIdentityType: "customer",
      currentIdentityScopeType: "global", currentIdentityScopeId: null }, "shop")).toThrow();
  });
  it("resolves operations preview scope for reads without granting publisher identity", () => {
    expect(resolveNoticeReadScope({
      ...actor,
      currentIdentityId: undefined,
      isReadOnlyMerchantPreview: true,
      merchantPreviewShopId: 12
    })).toEqual({ type: "shop", shopId: 12 });
  });
});
