import { BackofficeRepository } from "../src/repositories/backoffice.repository";

function modelClient() {
  return {
    findMany: jest.fn(async (args?: { where?: unknown }) => {
      void args;
      return [];
    }),
    count: jest.fn(async (args?: { where?: unknown }) => {
      void args;
      return 0;
    })
  };
}

describe("BackofficeRepository keyword filters", () => {
  it("applies the validated keyword to every data-center list", async () => {
    const client = {
      bookingOrder: modelClient(),
      scheduleSlot: modelClient(),
      technicianProfile: modelClient(),
      shop: modelClient(),
      orderFinancial: modelClient()
    };
    const repository = new BackofficeRepository(client as never);
    const query = { scope: "platform" as const, keyword: "Aoyama", page: 1, pageSize: 20 };

    await repository.listOrders(query);
    await repository.listSchedule(query);
    await repository.listTechnicians(query);
    await repository.listShops(query);
    await repository.listFinanceSettlements(query);

    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ orderNo: { contains: "Aoyama" } }])
        })
      })
    );
    expect(client.bookingOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
    expect(client.scheduleSlot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ shop: { name: { contains: "Aoyama" } } }])
        })
      })
    );
    expect(client.technicianProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ displayName: { contains: "Aoyama" } }])
        })
      })
    );
    expect(client.shop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ name: { contains: "Aoyama" } }])
        })
      })
    );
    expect(client.orderFinancial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ bookingOrder: { orderNo: { contains: "Aoyama" } } }])
        })
      })
    );
  });

  it("filters finance rows by persisted city and numeric settlement identifiers", async () => {
    const client = { orderFinancial: modelClient() };
    const repository = new BackofficeRepository(client as never);

    await repository.listFinanceSettlements({
      scope: "platform",
      keyword: "51",
      city: "東京都",
      page: 1,
      pageSize: 20
    } as never);

    expect(client.orderFinancial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingOrder: expect.objectContaining({ shop: { city: "東京都" } }),
          OR: expect.arrayContaining([
            { id: 51 },
            { bookingOrderId: 51 },
            { bookingOrder: { orderNo: { contains: "51" } } }
          ])
        })
      })
    );
  });

  it("applies a formal merchant name search to both finance rows and the filtered total", async () => {
    const client = { orderFinancial: modelClient() };
    const repository = new BackofficeRepository(client as never);

    await repository.listFinanceSettlements({
      scope: "platform",
      keyword: "Aoyama Holdings",
      page: 1,
      pageSize: 20
    });

    const expectedMerchantFilter = {
      bookingOrder: {
        shop: {
          merchantMemberships: {
            some: {
              deletedAt: null,
              merchantAccount: {
                name: { contains: "Aoyama Holdings" },
                deletedAt: null
              }
            }
          }
        }
      }
    };
    const listWhere = client.orderFinancial.findMany.mock.calls[0]?.[0]?.where;
    const countWhere = client.orderFinancial.count.mock.calls[0]?.[0]?.where;

    expect(listWhere).toEqual(
      expect.objectContaining({ OR: expect.arrayContaining([expectedMerchantFilter]) })
    );
    expect(countWhere).toEqual(listWhere);
  });

  it("applies a complete order number search to both finance rows and the filtered total", async () => {
    const client = { orderFinancial: modelClient() };
    const repository = new BackofficeRepository(client as never);

    await repository.listFinanceSettlements({
      scope: "platform",
      keyword: "ND202609200104226905",
      page: 1,
      pageSize: 20
    });

    const listWhere = client.orderFinancial.findMany.mock.calls[0]?.[0]?.where;
    const countWhere = client.orderFinancial.count.mock.calls[0]?.[0]?.where;

    expect(listWhere).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          { bookingOrder: { orderNo: { contains: "ND202609200104226905" } } }
        ])
      })
    );
    expect(countWhere).toEqual(listWhere);
  });

  it.each([
    ["PENDING", "pending"],
    ["CONFIRMED", "confirmed"],
    ["REFUND_PENDING", "refundPending"],
    ["REFUNDED", "refunded"]
  ])(
    "maps persisted payment status %s into the backoffice order payload",
    async (paymentStatus, expected) => {
      const order = {
        id: 31,
        orderNo: "ND202608250001",
        status: "CONFIRMED",
        paymentStatus,
        customerUserId: 7,
        customer: {
          username: "Customer",
          email: "customer@example.com",
          customerProfile: { id: 41 }
        },
        serviceId: 3,
        serviceNameSnapshot: "Formal Service",
        service: { name: "Formal Service" },
        shopId: 11,
        shop: { name: "Aoyama Care Studio" },
        technicianProfileId: 17,
        technicianProfile: {
          displayName: "Mika",
          user: {
            identities: [{ publicIdentifier: { publicId: "s0000000017" } }]
          }
        },
        fulfillmentMode: "store",
        priceAmount: { toString: () => "9800" },
        paymentAmountJpy: 9800,
        paymentMethod: "ONSITE",
        checkout: null,
        financial: null,
        currency: "JPY",
        startsAt: new Date("2026-08-25T01:00:00.000Z"),
        endsAt: new Date("2026-08-25T02:00:00.000Z"),
        note: null,
        cancelReason: null,
        createdAt: new Date("2026-08-24T01:00:00.000Z"),
        updatedAt: new Date("2026-08-25T01:00:00.000Z")
      };
      const client = {
        bookingOrder: {
          findMany: jest.fn(async () => [order]),
          count: jest.fn(async () => 1)
        }
      };
      const repository = new BackofficeRepository(client as never);

      const response = await repository.listOrders({ scope: "platform", page: 1, pageSize: 20 });

      expect(response.list[0]?.paymentStatus).toBe(expected);
      expect(response.list[0]).toMatchObject({
        customerProfileId: 41,
        technicianNeedoId: "s0000000017"
      });
    }
  );

  it.each([
    [
      "a legacy pre-checkout order whose payment snapshot kept the database default",
      {
        status: "CONFIRMED",
        paymentStatus: "PENDING",
        paymentAmountJpy: 0,
        paymentMethod: "ONSITE",
        checkout: null,
        financial: null
      },
      {
        totalAmountJpy: 8_000,
        amountSource: "order_price",
        paymentMethod: "onsite",
        effectivePaymentMethod: "onsite",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: null,
        ndpCurrency: null
      }
    ],
    [
      "an order without checkout",
      {
        status: "CONFIRMED",
        paymentStatus: "PENDING",
        paymentAmountJpy: 8_000,
        paymentMethod: "ONSITE",
        checkout: null,
        financial: null
      },
      {
        totalAmountJpy: 8_000,
        amountSource: "order_payment",
        paymentMethod: "onsite",
        effectivePaymentMethod: "onsite",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: null,
        ndpCurrency: null
      }
    ],
    [
      "a checkout awaiting payment-channel selection",
      {
        status: "AWAITING_CHECKOUT",
        paymentStatus: "PENDING",
        paymentAmountJpy: 8_000,
        paymentMethod: "ONSITE",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: null,
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: null
        },
        financial: null
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "onsite",
        effectivePaymentMethod: null,
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: null,
        ndpCurrency: null
      }
    ],
    [
      "a custom checkout payment method",
      {
        status: "AWAITING_PAYMENT_CONFIRMATION",
        paymentStatus: "PENDING",
        paymentAmountJpy: 8_000,
        paymentMethod: "ONSITE",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 0,
          paymentMethod: "OTHER",
          otherMethodCode: "paypay",
          otherMethodLabel: "PayPay",
          deletedAt: null,
          ledgerTransaction: null
        },
        financial: null
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "onsite",
        effectivePaymentMethod: "other",
        otherMethodCode: "paypay",
        otherMethodLabel: "PayPay",
        checkoutPaymentAmountNdp: null,
        ndpCurrency: null
      }
    ],
    [
      "a pending checkout with multiple accepted add-ons",
      {
        status: "AWAITING_CHECKOUT",
        paymentStatus: "PENDING",
        paymentAmountJpy: 8_000,
        paymentMethod: "ONSITE",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: "NDP",
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: null
        },
        financial: {
          serviceAmountJpy: 8_000,
          settlementStatus: "pending",
          ndpCurrency: "TEST_NDP",
          deletedAt: null
        }
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "onsite",
        effectivePaymentMethod: "ndp",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: 14_500,
        ndpCurrency: "TEST_NDP"
      }
    ],
    [
      "a completed settled checkout",
      {
        status: "COMPLETED",
        paymentStatus: "CONFIRMED",
        paymentAmountJpy: 8_000,
        paymentMethod: "NDP",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: "NDP",
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: { currency: "NDP", deletedAt: null }
        },
        financial: {
          serviceAmountJpy: 12_000,
          settlementStatus: "settled",
          ndpCurrency: "NDP",
          deletedAt: null
        }
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "ndp",
        effectivePaymentMethod: "ndp",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: 14_500,
        ndpCurrency: "NDP"
      }
    ],
    [
      "a refunded settled checkout",
      {
        status: "COMPLETED",
        paymentStatus: "REFUNDED",
        paymentAmountJpy: 8_000,
        paymentMethod: "CASH",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: "CASH",
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: null
        },
        financial: {
          serviceAmountJpy: 12_000,
          settlementStatus: "refunded",
          ndpCurrency: "NDP",
          deletedAt: null
        }
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "cash",
        effectivePaymentMethod: "cash",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: null,
        ndpCurrency: null
      }
    ],
    [
      "an NDP checkout whose currency provenance was retired",
      {
        status: "AWAITING_CHECKOUT",
        paymentStatus: "PENDING",
        paymentAmountJpy: 8_000,
        paymentMethod: "ONSITE",
        checkout: {
          checkoutAmountJpy: 14_500,
          payableNdp: 14_500,
          paymentMethod: "NDP",
          otherMethodCode: null,
          otherMethodLabel: null,
          deletedAt: null,
          ledgerTransaction: {
            currency: "TEST_NDP",
            deletedAt: new Date("2026-09-10T03:00:00.000Z")
          }
        },
        financial: {
          serviceAmountJpy: 8_000,
          settlementStatus: "pending",
          ndpCurrency: "TEST_NDP",
          deletedAt: new Date("2026-09-10T03:00:00.000Z")
        }
      },
      {
        totalAmountJpy: 14_500,
        amountSource: "checkout",
        paymentMethod: "onsite",
        effectivePaymentMethod: "ndp",
        otherMethodCode: null,
        otherMethodLabel: null,
        checkoutPaymentAmountNdp: 14_500,
        ndpCurrency: null
      }
    ]
  ])("projects authoritative totals and payment units for %s", async (_label, financialState, expected) => {
    const order = {
      id: 31,
      orderNo: "ND202609101341243926",
      customerUserId: 7,
      customer: {
        username: "Customer",
        email: "customer@example.com",
        customerProfile: { id: 41 }
      },
      serviceId: 3,
      serviceNameSnapshot: "Formal Service",
      service: { name: "Formal Service" },
      shopId: 11,
      shop: { name: "Aoyama Care Studio" },
      technicianProfileId: 17,
      technicianProfile: {
        displayName: "Mika",
        user: { identities: [{ publicIdentifier: { publicId: "s0000000017" } }] }
      },
      fulfillmentMode: "store",
      priceAmount: { toString: () => "8000" },
      currency: "JPY",
      startsAt: new Date("2026-09-10T01:00:00.000Z"),
      endsAt: new Date("2026-09-10T02:00:00.000Z"),
      note: null,
      cancelReason: null,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T03:00:00.000Z"),
      ...financialState
    };
    const repository = new BackofficeRepository({
      bookingOrder: {
        findMany: jest.fn(async () => [order]),
        count: jest.fn(async () => 1)
      }
    } as never);

    const response = await repository.listOrders({ scope: "platform", page: 1, pageSize: 20 });

    expect(response.list[0]).toMatchObject({
      priceAmount: 8_000,
      currency: "JPY",
      ...expected
    });
  });
});
