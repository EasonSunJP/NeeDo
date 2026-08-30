import {
  resolveFormalMerchantIdentityKind,
  resolveMerchantShopScope
} from "../src/services/merchant-shop-scope";
import { ERROR_CODES } from "../src/constants/error-codes";

describe("formal merchant identity scope pairs", () => {
  it.each([
    ["merchant", "shop", "shop"],
    ["merchant_owner", "shop", "shop"],
    ["merchant_staff", "shop", "shop"],
    ["business", "shop", "shop"],
    ["b", "shop", "shop"],
    ["merchant_owner", "merchant_account", "merchant_account"],
    ["merchant_owner", "merchant", "merchant_account"],
    ["merchant_organization", "merchant_account", "merchant_account"],
    ["merchant_organization", "merchant", "merchant_account"],
    ["owner", "merchant_account", "merchant_account"],
    ["owner", "merchant", "merchant_account"],
    ["o", "merchant_account", "merchant_account"],
    ["o", "merchant", "merchant_account"]
  ] as const)("allows %s + %s as %s", (type, scopeType, expected) => {
    expect(resolveFormalMerchantIdentityKind({ type, scopeType, scopeId: 41 })).toBe(expected);
  });

  it.each(["merchant_organization", "owner", "o", "merchant_owner"] as const)(
    "keeps compatible unscoped %s + global identities usable without a shop claim",
    async (type) => {
      const repository = {
        listManageableShops: jest.fn(),
        resolveDefaultShop: jest.fn(),
        resolveShop: jest.fn()
      };
      const identity = { type, scopeType: "global", scopeId: null };

      expect(resolveFormalMerchantIdentityKind(identity)).toBe("unscoped");
      await expect(resolveMerchantShopScope({ repository, identity })).resolves.toBeNull();
      expect(repository.listManageableShops).not.toHaveBeenCalled();
      expect(repository.resolveDefaultShop).not.toHaveBeenCalled();
      expect(repository.resolveShop).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["customer", "merchant_account"],
    ["technician", "merchant_account"],
    ["customer", "shop"],
    ["technician", "shop"],
    ["merchant", "merchant_account"],
    ["merchant_staff", "merchant_account"],
    ["owner", "shop"],
    ["merchant_organization", "shop"]
  ] as const)("rejects forged or unsupported %s + %s", (type, scopeType) => {
    expect(() => resolveFormalMerchantIdentityKind({ type, scopeType, scopeId: 41 })).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.IDENTITY_FORBIDDEN,
        message: "error.identity.forbidden",
        statusCode: 403
      })
    );
  });
});
