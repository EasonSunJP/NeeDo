import express from "express";
import request from "supertest";
import { CoreReadController } from "../src/controllers/core-read.controller";
import { PricingModeController } from "../src/controllers/pricing-mode.controller";
import { BookingController } from "../src/controllers/booking.controller";
import { EntityEngagementService } from "../src/services/entity-engagement.service";

const auth = {
  userId: 7, currentIdentityId: 70, currentIdentityType: "merchant_organization",
  currentIdentityScopeType: "merchant_account", currentIdentityScopeId: 30,
  selectedMerchantShopId: 21
};
const viewer = {
  userId: 7, identityId: 70, identityType: "merchant_organization",
  identityScopeType: "merchant_account", identityScopeId: 30, selectedShopId: 21
};

describe("shop visibility selected merchant identity", () => {
  it("retains the selected shop scope for the separate customer network privacy policy", async () => {
    const getCustomerProfile = jest.fn(async () => ({}));
    const core = new CoreReadController({ getCustomerProfile } as never);
    const app = express();
    app.use((_req, res, next) => { res.locals.auth = auth; next(); });
    app.get("/customers/:id", core.getCustomerProfile);
    await request(app).get("/customers/91").expect(200);
    expect(getCustomerProfile).toHaveBeenCalledWith(91, {
      userId: 7, identityId: 70, identityType: "merchant_organization",
      identityScopeType: "shop", identityScopeId: 21
    });
  });
  it("preserves account relationships and selected shop ownership through HTTP read boundaries", async () => {
    const search = jest.fn(async () => ({}));
    const getShopDetail = jest.fn(async () => ({}));
    const getBookingNavigation = jest.fn(async () => ({}));
    const listAvailableSlots = jest.fn(async () => ({}));
    const core = new CoreReadController({ search, getShopDetail } as never);
    const pricing = new PricingModeController({ getBookingNavigation } as never);
    const booking = new BookingController({ listAvailableSlots } as never);
    const app = express();
    app.use((_req, res, next) => { res.locals.auth = auth; next(); });
    app.get("/search", core.search);
    app.get("/shops/:id", core.getShopDetail);
    app.get("/shops/:shopId/navigation", pricing.getBookingNavigation);
    app.get("/availability", booking.listAvailableSlots);

    await request(app).get("/search?entityType=shop").expect(200);
    await request(app).get("/shops/21").expect(200);
    await request(app).get("/shops/21/navigation").expect(200);
    await request(app).get("/availability?serviceId=1&from=2026-09-20T00:00:00.000Z&to=2026-09-21T00:00:00.000Z").expect(200);
    expect(search).toHaveBeenCalledWith(expect.anything(), undefined, viewer);
    expect(getShopDetail).toHaveBeenCalledWith(21, undefined, viewer);
    expect(getBookingNavigation).toHaveBeenCalledWith(21, expect.anything(), viewer);
    expect(listAvailableSlots).toHaveBeenCalledWith(expect.anything(), viewer);
  });

  it("carries the same merchant identity to favorite authorization", async () => {
    const setFavorite = jest.fn(async () => ({}));
    const service = new EntityEngagementService({ setFavorite } as never);
    await service.setFavorite(auth as never, "shop", "shop0000000021", true);
    expect(setFavorite).toHaveBeenCalledWith(7,
      { targetType: "shop", publicId: "shop0000000021" }, true, viewer);
  });
});
