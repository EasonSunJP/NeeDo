import {
  customerAddressCreateBodySchema,
  customerAddressListQuerySchema,
  customerAddressUpdateBodySchema
} from "../src/validators/customer-address.validator";

const address = {
  label: " 自宅 ",
  countryCode: "JP" as const,
  postalCode: "１６０－００２２",
  admin1Code: "13",
  prefecture: " 東京都 ",
  admin2Code: "13104",
  city: " 新宿区 ",
  addressLine1: " 新宿1-1-1 ",
  addressLine2: " ",
  building: " NeeDo 301 ",
  isDefault: true
};

describe("customer address validators", () => {
  it("accepts the checkout Japanese address fields and rejects unknown fields", () => {
    expect(customerAddressCreateBodySchema.parse(address)).toMatchObject({
      label: "自宅",
      countryCode: "JP",
      admin1Code: "13",
      admin2Code: "13104"
    });
    expect(() => customerAddressCreateBodySchema.parse({ ...address, userId: 99 })).toThrow();
  });

  it("allows partial edits but never allows clearing the default flag directly", () => {
    expect(customerAddressUpdateBodySchema.parse({ label: "会社", isDefault: true })).toEqual({
      label: "会社",
      isDefault: true
    });
    expect(() => customerAddressUpdateBodySchema.parse({ isDefault: false })).toThrow();
    expect(() => customerAddressUpdateBodySchema.parse({})).toThrow();
    expect(() => customerAddressUpdateBodySchema.parse({ admin1Code: "13" })).toThrow();
  });

  it("requires bounded pagination", () => {
    expect(customerAddressListQuerySchema.parse({ page: "2", pageSize: "50" })).toEqual({
      page: 2,
      pageSize: 50
    });
    expect(() => customerAddressListQuerySchema.parse({ pageSize: "101" })).toThrow();
  });
});
