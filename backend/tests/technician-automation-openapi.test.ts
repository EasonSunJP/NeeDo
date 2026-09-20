import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("technician automation OpenAPI", () => {
  it("documents settings read/write and paginated IM contact options", () => {
    const document = createOpenApiDocument(env) as { paths: Record<string, Record<string, unknown>> };
    const settings = document.paths[`${env.API_PREFIX}/technician/automation-settings/{kind}`];
    const contacts = document.paths[`${env.API_PREFIX}/technician/automation-settings/contacts`];
    expect(settings).toEqual(expect.objectContaining({ get: expect.any(Object), put: expect.any(Object) }));
    expect(contacts).toEqual(expect.objectContaining({ get: expect.any(Object) }));
    expect(JSON.stringify(settings)).toContain("technician:automation-settings:write");
    expect(JSON.stringify(settings)).toContain("minimumPrepaymentPercent");
    expect(JSON.stringify(settings)).toContain("10");
    expect(JSON.stringify(settings)).toContain("100");
    expect(JSON.stringify(contacts)).toContain("page_size");
  });

  it("documents server-calculated Booking and Request NDP prepayments without client amount fields", () => {
    const document = createOpenApiDocument(env) as { paths: Record<string, Record<string, unknown>> };
    const booking = document.paths[`${env.API_PREFIX}/bookings/{id}/service-prepayment`];
    const request = document.paths[`${env.API_PREFIX}/exchange/posts/{id}/service-prepayment`];
    expect(booking).toEqual(expect.objectContaining({ post: expect.any(Object) }));
    expect(request).toEqual(expect.objectContaining({ post: expect.any(Object) }));
    for (const operation of [booking, request]) {
      const serialized = JSON.stringify(operation);
      expect(serialized).toContain("Idempotency-Key");
      expect(serialized).toContain('"percent"');
      expect(serialized).not.toContain('"amountJpy"');
    }
    expect(JSON.stringify(request)).toContain("publication fee");
  });
});
