import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

type Schema = Record<string, unknown> & {
  additionalProperties: boolean;
  description: string;
  discriminator: { propertyName: string };
  enum: Array<string | null>;
  items: Schema;
  oneOf: Schema[];
  properties: Record<string, Schema>;
  required: string[];
  $ref: string;
};
type Parameter = { name: string; description?: string; schema: Schema };
type Operation = {
  operationId: string;
  security: Array<Record<string, unknown>>;
  "x-required-permission": string;
  parameters: Parameter[];
  requestBody: { content: { "application/json": { schema: Schema } } };
  responses: Record<string, unknown>;
};

const document = createOpenApiDocument(env) as unknown as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
};
const paths = document.paths as Record<string, Record<string, Operation>>;
const schemas = document.components.schemas as Record<string, Schema>;

const operations = [
  ["post", "/api/v1/orders/{id}/service/start", "order:service:start", "200"],
  ["post", "/api/v1/orders/{id}/add-ons", "order:add-on:write", "200"],
  ["post", "/api/v1/orders/{id}/add-ons/{addOnId}/accept", "order:add-on:write", "200"],
  ["post", "/api/v1/orders/{id}/add-ons/{addOnId}/reject", "order:add-on:write", "200"],
  ["post", "/api/v1/orders/{id}/service/end", "order:service:end", "200"],
  ["get", "/api/v1/orders/{id}/checkout", "order:checkout:read", "200"],
  ["post", "/api/v1/orders/{id}/checkout/payment-method", "order:checkout:payment-method:write", "200"],
  ["post", "/api/v1/orders/{id}/checkout/pay/ndp", "order:checkout:ndp:pay", "200"],
  ["post", "/api/v1/orders/{id}/checkout/confirm-receipt", "order:checkout:receipt:confirm", "200"],
  ["post", "/api/v1/backoffice/orders/{id}/checkout/confirm-receipt", "backoffice:order:checkout:receipt-override", "200"],
  ["post", "/api/v1/orders/{id}/reviews", "order:review:create", "200"],
  ["get", "/api/v1/orders/{id}/reviews/mine", "order:review:create", "200"],
  ["get", "/api/v1/backoffice/ndp-exchange-rates", "backoffice:ndp-exchange-rate:read", "200"],
  ["post", "/api/v1/backoffice/ndp-exchange-rates", "backoffice:ndp-exchange-rate:write", "201"]
] as const;

const bodySchema = (method: string, path: string): Schema =>
  resolveSchema(paths[path][method].requestBody.content["application/json"].schema);

function resolveSchema(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.replace("#/components/schemas/", "");
  return schemas[name];
}

const responseDescription = (method: string, path: string, status: string): string =>
  (paths[path][method].responses[status] as { description: string }).description;

const mutationOperations = operations.filter(([method]) => method === "post");

describe("formal order fulfillment OpenAPI contract", () => {
  it("documents all 14 authenticated operations with exact permissions and unique operation IDs", () => {
    const operationIds: string[] = [];
    for (const [method, path, permission, success] of operations) {
      const operation = paths[path]?.[method];
      expect(operation).toBeDefined();
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation["x-required-permission"]).toBe(permission);
      expect(operation.responses).toHaveProperty(success);
      expect(operation.operationId).toEqual(expect.any(String));
      operationIds.push(operation.operationId);
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(paths).not.toHaveProperty("/api/v1/orders/{id}/start");
    expect(paths).not.toHaveProperty("/api/v1/orders/{id}/complete");
  });

  it("matches strict fulfillment request unions, limits and path identifiers", () => {
    const start = bodySchema("post", "/api/v1/orders/{id}/service/start");
    expect(start).toMatchObject({ oneOf: expect.any(Array), discriminator: { propertyName: "actor" } });
    expect(start.oneOf).toHaveLength(2);
    expect(start.oneOf[0]).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["actor", "idempotencyKey"]
    });
    expect(start.oneOf[1]).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["actor", "verificationCode", "idempotencyKey"]
    });
    expect(start.oneOf[1].properties.verificationCode.pattern).toBe("^[0-9]{6}$");

    const proposal = bodySchema("post", "/api/v1/orders/{id}/add-ons");
    expect(proposal).toMatchObject({
      additionalProperties: false,
      required: ["serviceId", "idempotencyKey"],
      properties: { serviceId: { type: "integer", minimum: 1, maximum: 2_147_483_647 } }
    });
    for (const suffix of ["accept", "reject"]) {
      expect(bodySchema("post", `/api/v1/orders/{id}/add-ons/{addOnId}/${suffix}`)).toMatchObject({
        additionalProperties: false,
        required: ["idempotencyKey"]
      });
      const parameters = paths[`/api/v1/orders/{id}/add-ons/{addOnId}/${suffix}`].post.parameters;
      expect(parameters.find((item) => item.name === "id")?.schema.maximum).toBe(2_147_483_647);
      expect(parameters.find((item) => item.name === "addOnId")?.schema.maximum).toBe(2_147_483_647);
    }
    const orderId = paths["/api/v1/orders/{id}/service/start"].post.parameters[0].schema;
    expect(orderId).toEqual({ type: "integer", minimum: 1 });
    const end = bodySchema("post", "/api/v1/orders/{id}/service/end");
    expect(end).toMatchObject({ additionalProperties: false, required: ["reason", "idempotencyKey"] });
    expect(resolveSchema(end.properties.reason)).toMatchObject({ minLength: 1, maxLength: 500 });
  });

  it("uses the actual order-id persistence bound only on add-on decisions", () => {
    const bounded = new Set([
      "/api/v1/orders/{id}/add-ons/{addOnId}/accept",
      "/api/v1/orders/{id}/add-ons/{addOnId}/reject"
    ]);
    const orderPaths = operations.filter(([, path]) => path.includes("{id}"));
    for (const [method, path] of orderPaths) {
      const id = paths[path][method].parameters.find((parameter) => parameter.name === "id");
      expect(id?.schema).toMatchObject({ type: "integer", minimum: 1 });
      if (bounded.has(path)) expect(id?.schema.maximum).toBe(2_147_483_647);
      else expect(id?.schema).not.toHaveProperty("maximum");
    }
  });

  it("matches strict checkout and review request unions", () => {
    const payment = bodySchema("post", "/api/v1/orders/{id}/checkout/payment-method");
    expect(payment).toMatchObject({ oneOf: expect.any(Array), discriminator: { propertyName: "method" } });
    expect(payment.oneOf).toHaveLength(3);
    expect(payment.oneOf.every((item: Schema) => item.additionalProperties === false)).toBe(true);
    expect(payment.oneOf.map((item: Schema) => item.properties.method.enum[0])).toEqual([
      "cash",
      "ndp",
      "other"
    ]);
    expect(payment.oneOf[2].required).toEqual([
      "method", "otherMethodCode", "otherMethodLabel", "idempotencyKey"
    ]);
    expect(resolveSchema(payment.oneOf[2].properties.otherMethodCode)).toMatchObject({
      minLength: 1,
      maxLength: 40
    });
    expect(resolveSchema(payment.oneOf[2].properties.otherMethodLabel)).toMatchObject({
      minLength: 1,
      maxLength: 80
    });
    for (const path of [
      "/api/v1/orders/{id}/checkout/pay/ndp",
      "/api/v1/orders/{id}/checkout/confirm-receipt",
      "/api/v1/backoffice/orders/{id}/checkout/confirm-receipt"
    ]) {
      expect(bodySchema("post", path).additionalProperties).toBe(false);
    }

    const review = bodySchema("post", "/api/v1/orders/{id}/reviews");
    expect(review).toMatchObject({
      additionalProperties: false,
      required: ["targetType", "rating", "tags", "comment", "idempotencyKey"],
      properties: {
        targetType: { enum: ["technician", "customer"] },
        rating: { type: "integer", minimum: 1, maximum: 5 },
        tags: { type: "array", maxItems: 8 },
        comment: expect.any(Object)
      }
    });
    expect(review.properties.tags.items.maxLength).toBe(40);
    expect(review.properties.comment.oneOf).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "string", maxLength: 1000 }), { type: "null" }])
    );
    expect(review.description).toMatch(/Unicode 16 default case fold/i);
    expect(review.description).toMatch(/reviewer.*target|target.*reviewer/i);
  });

  it("publishes complete safe fulfillment projections and a customer-only code extension", () => {
    const statuses = [
      "pending", "confirmed", "inService", "awaitingCheckout",
      "awaitingPaymentConfirmation", "completed", "cancelled"
    ];
    expect(schemas.BookingOrder.properties.status.enum).toEqual(statuses);
    expect(schemas.OrderStatusHistory.properties.toStatus.enum).toEqual(statuses);
    expect(schemas.BookingOrder.properties.serviceId.type).toEqual(["integer", "null"]);
    expect(schemas.BookingOrder.properties.technicianServiceId.type).toEqual(["integer", "null"]);
    expect(schemas.BookingOrder.properties).toEqual(expect.objectContaining({
      pricingModeSnapshot: expect.any(Object),
      serviceOwnerType: expect.any(Object),
      serviceOwnerId: expect.any(Object),
      serviceNameSnapshot: expect.any(Object),
      servicePriceSnapshot: expect.any(Object),
      serviceDurationSnapshot: expect.any(Object),
      serviceSnapshot: expect.any(Object),
      serviceSession: expect.any(Object)
    }));
    expect(schemas.OrderServiceSession.properties.addOns.items.$ref).toBe("#/components/schemas/OrderAddOn");
    expect(schemas.OrderAddOn.properties.status.enum).toEqual(["proposed", "accepted", "rejected"]);
    expect(schemas.OrderAddOn.properties.proposedBy.enum).toEqual(["customer", "technician", null]);
    expect(schemas.OrderAddOn.properties.resolvedBy.enum).toEqual(["customer", "technician", null]);
    expect(JSON.stringify(schemas.BookingOrder)).not.toMatch(/verification(Hash|Code)/i);
    expect(schemas.CustomerBookingOrderDetail.properties.serviceVerificationCode).toMatchObject({
      type: "string",
      pattern: "^[0-9]{6}$"
    });
    expect(
      paths["/api/v1/orders/{id}"].get.responses["200"]
    ).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/CustomerBookingOrderDetail" }
            }
          }
        }
      }
    });
    expect(JSON.stringify(schemas)).not.toMatch(/verificationHash/i);
  });

  it("documents the exact checkout calculation and safe response whitelist", () => {
    const checkout = schemas.OrderCheckout;
    expect(checkout.additionalProperties).toBe(false);
    expect(checkout.properties.calculation.$ref).toBe("#/components/schemas/OrderCheckoutCalculation");
    expect(schemas.OrderCheckoutCalculation).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "formula", "baseAmountJpy", "acceptedAddOnIds", "addOnAmountJpy",
        "discountAmountJpy", "checkoutAmountJpy", "rateFormula"
      ]
    });
    expect(schemas.OrderCheckoutCalculation.properties.formula.enum).toEqual([
      "base_plus_accepted_add_ons_minus_discount"
    ]);
    expect(schemas.OrderCheckoutCalculation.properties.rateFormula.enum).toEqual([
      "ceil(jpy_times_ndp_units_divided_by_jpy_units)"
    ]);
    expect(checkout.properties.paymentEvidence.enum).toEqual([
      "ndp_ledger", "technician_receipt_confirmation", "operations_receipt_override", null
    ]);
    expect(Object.keys(checkout.properties)).toEqual([
      "id", "orderId", "status", "baseAmountJpy", "addOnAmountJpy", "discountAmountJpy",
      "checkoutAmountJpy", "payableNdp", "rate", "calculation", "paymentMethod",
      "paymentSelectedAt", "otherMethod", "paymentEvidence", "receiptConfirmedAt",
      "receiptConfirmationReason", "createdAt", "updatedAt"
    ]);
  });

  it("documents review wrappers with only the public review fields", () => {
    expect(schemas.OrderReviewProjection.additionalProperties).toBe(false);
    expect(Object.keys(schemas.OrderReviewProjection.properties)).toEqual([
      "targetType", "rating", "tags", "comment", "createdAt"
    ]);
    expect(schemas.OrderReviewMutationResult).toMatchObject({
      additionalProperties: false,
      required: ["applied", "review"]
    });
    expect(schemas.OrderReviewMineResult).toMatchObject({
      additionalProperties: false,
      required: ["review"]
    });
    expect(JSON.stringify([
      schemas.OrderReviewProjection,
      schemas.OrderReviewMutationResult,
      schemas.OrderReviewMineResult
    ])).not.toMatch(/orderId|profileId|reviewer|idempotency|fingerprint|audit/i);
  });

  it("documents NDP rate query semantics, publication sentinel and bounded publish body", () => {
    const get = paths["/api/v1/backoffice/ndp-exchange-rates"].get;
    const at = get.parameters.find((item) => item.name === "at");
    expect(at?.description).toMatch(/omitted.*server time/i);
    expect(schemas.NdpExchangeRate.properties.status.description).toMatch(/publication sentinel/i);
    expect(schemas.NdpExchangeRateOverview.description).toMatch(/evaluatedAt/i);
    expect(schemas.NdpExchangeRateOverview.required).toEqual(
      expect.arrayContaining(["current", "nextScheduled", "evaluatedAt", "history"])
    );
    expect(schemas.NdpExchangeRatePublish.properties).toMatchObject({
      ndpUnits: { maximum: 2_147_483_647 },
      jpyUnits: { maximum: 2_147_483_647 },
      expectedVersion: { maximum: 2_147_483_646 }
    });
    expect(resolveSchema(schemas.NdpExchangeRatePublish.properties.idempotencyKey)).toMatchObject({
      minLength: 16,
      maxLength: 160
    });
    expect(JSON.stringify(schemas.NdpExchangeRate)).not.toMatch(/activeKey|idempotencyKey/i);
  });

  it("documents trim and visible-code-point semantics for every mutation string", () => {
    const idempotency = schemas.TrimmedVisibleIdempotencyKey;
    expect(idempotency).toMatchObject({
      type: "string",
      minLength: 16,
      maxLength: 160,
      "x-normalization": "trim",
      "x-requires-visible-code-point": true
    });
    expect(idempotency.description).toMatch(/whitespace-only.*invalid/i);

    for (const [method, path] of mutationOperations) {
      const request = bodySchema(method, path);
      const variants = request.oneOf?.length ? request.oneOf : [request];
      for (const variant of variants) {
        expect(variant.properties.idempotencyKey).toEqual({
          $ref: "#/components/schemas/TrimmedVisibleIdempotencyKey"
        });
      }
    }

    const normalizedValueIsValid = (value: string, schema: Schema): boolean => {
      const normalized = schema["x-normalization"] === "trim" ? value.trim() : value;
      const minLength = schema.minLength as number;
      const maxLength = schema.maxLength as number;
      const visible = /[\p{L}\p{N}\p{P}\p{S}]/u.test(normalized);
      return normalized.length >= minLength && normalized.length <= maxLength && visible;
    };
    expect(normalizedValueIsValid("                ", idempotency)).toBe(false);
    expect(normalizedValueIsValid("abcdefghijklmnop", idempotency)).toBe(true);

    for (const name of [
      "TrimmedVisibleReason500",
      "TrimmedVisibleOtherMethodCode",
      "TrimmedVisibleOtherMethodLabel"
    ]) {
      expect(schemas[name]).toMatchObject({
        type: "string",
        minLength: 1,
        "x-normalization": "trim",
        "x-requires-visible-code-point": true
      });
      expect(normalizedValueIsValid("   \t", schemas[name])).toBe(false);
    }
    expect(
      bodySchema("post", "/api/v1/backoffice/ndp-exchange-rates").properties.reason
    ).toEqual({ $ref: "#/components/schemas/TrimmedVisibleReason500" });
  });

  it("publishes actual error code, message and condition pairs without invented messages", () => {
    const requiredStatuses: Record<string, string[]> = {
      "/api/v1/orders/{id}/service/start": ["400", "401", "403", "404", "409"],
      "/api/v1/orders/{id}/add-ons": ["400", "401", "403", "404", "409"],
      "/api/v1/orders/{id}/service/end": ["400", "401", "403", "404", "409"],
      "/api/v1/orders/{id}/checkout": ["400", "401", "403", "404", "409", "503"],
      "/api/v1/orders/{id}/checkout/pay/ndp": ["400", "401", "403", "404", "409", "503"],
      "/api/v1/orders/{id}/reviews": ["400", "401", "403", "404", "409"]
    };
    for (const [path, statuses] of Object.entries(requiredStatuses)) {
      const operation = paths[path][path.endsWith("checkout") ? "get" : "post"];
      for (const status of statuses) expect(operation.responses).toHaveProperty(status);
    }

    const expectedConditions: Array<[string, string, string, string[]]> = [
      ["post", "/api/v1/orders/{id}/service/start", "400", [
        "40001 error.validation — strict request validation failed",
        "40108 error.order.verification_code_invalid — the assigned technician supplied an invalid service verification code"
      ]],
      ["post", "/api/v1/orders/{id}/service/start", "403", [
        "40301 error.forbidden — missing permission",
        "40301 error.auth.identity_forbidden — requested actor does not match the authenticated identity"
      ]],
      ["post", "/api/v1/orders/{id}/add-ons", "400", [
        "40001 error.validation — strict request validation failed",
        "40001 error.order.add_on_service_invalid — service is not an eligible published same-shop add-on"
      ]],
      ["post", "/api/v1/orders/{id}/service/end", "409", [
        "40906 error.order.invalid_transition — state transition is invalid, including unresolved add-ons",
        "40961 error.idempotency.key_reused — the key's stored command is not equivalent"
      ]],
      ["get", "/api/v1/orders/{id}/checkout", "404", [
        "40401 error.order.not_found — the order or participant is deliberately hidden from this actor",
        "40418 error.ndp_exchange_rate.not_found — no exchange rate is effective at checkout creation time"
      ]],
      ["post", "/api/v1/orders/{id}/checkout/payment-method", "409", [
        "40964 error.order.checkout.invalid_state — checkout state rejects the command",
        "40965 error.order.checkout.invalid_snapshot — stored checkout evidence is inconsistent",
        "40961 error.idempotency.key_reused — the key's stored command is not equivalent"
      ]],
      ["post", "/api/v1/orders/{id}/checkout/pay/ndp", "409", [
        "40907 error.wallet.insufficient_available — the customer NDP wallet cannot cover payableNdp",
        "40964 error.order.checkout.invalid_state — checkout state rejects payment",
        "40965 error.order.checkout.invalid_snapshot — stored checkout evidence is inconsistent",
        "40961 error.idempotency.key_reused — the key's stored command is not equivalent"
      ]],
      ["post", "/api/v1/orders/{id}/checkout/confirm-receipt", "503", [
        "50301 error.dependency_unavailable — the checkout ledger, affiliate, or booking-settlement dependency is unavailable"
      ]],
      ["post", "/api/v1/orders/{id}/reviews", "409", [
        "40906 error.order.review_requires_completion — the order is not completed",
        "40965 error.order.review_invalid_settlement — formal checkout settlement evidence is missing or inconsistent",
        "40961 error.order.review_already_submitted — this reviewer already submitted the directional review",
        "40961 error.idempotency.key_reused — the key's stored review is not equivalent"
      ]],
      ["post", "/api/v1/orders/{id}/reviews", "503", [
        "50301 error.dependency_unavailable — the formal review audit dependency is unavailable"
      ]],
      ["get", "/api/v1/backoffice/ndp-exchange-rates", "403", [
        "40301 error.forbidden — missing required permission",
        "40305 error.identity.forbidden — authenticated identity is not global or platform scoped"
      ]],
      ["post", "/api/v1/backoffice/ndp-exchange-rates", "409", [
        "40963 error.ndp_exchange_rate.conflict — expected version, chronology, race, or unique future-rate constraint failed",
        "40961 error.idempotency.key_reused — the key's stored publication is not equivalent"
      ]]
    ];
    for (const [method, path, status, conditions] of expectedConditions) {
      const description = responseDescription(method, path, status);
      for (const condition of conditions) expect(description).toContain(condition);
    }

    const serialized = JSON.stringify(operations.map(([method, path]) => paths[path][method].responses));
    for (const invented of [
      "error.order.unresolved_add_on",
      "error.wallet.insufficient_balance",
      "error.order.checkout_invalid_state",
      "error.order.checkout_invalid_snapshot",
      "error.dependency.unavailable",
      "error.order.checkout_rate_required"
    ]) expect(serialized).not.toContain(invented);
  });
});
