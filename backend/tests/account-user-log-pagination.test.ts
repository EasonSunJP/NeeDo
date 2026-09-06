import { accountLogPagination } from "../src/domain/account-user-log";

const account = { id: 41, displayName: "Mia", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z" };
describe("account origin in paginated LOG", () => {
  it("counts the real account creation once and reserves the first row", () => {
    expect(accountLogPagination(account, { audit_page: 1, audit_page_size: 10 })).toMatchObject({ extraTotal: 1, skip: 0, take: 9, origin: [{ action: "account.created", createdAt: account.createdAt }] });
    expect(accountLogPagination(account, { audit_page: 2, audit_page_size: 10 })).toMatchObject({ extraTotal: 1, skip: 9, take: 10, origin: [] });
  });
  it("excludes account creation outside the selected half-open interval", () => {
    expect(accountLogPagination(account, { audit_page: 1, audit_page_size: 10, audit_from: "2026-09-02T00:00:00.000Z", audit_to: "2026-09-03T00:00:00.000Z" })).toMatchObject({ extraTotal: 0, skip: 0, take: 10, origin: [] });
    expect(accountLogPagination(account, { audit_page: 1, audit_page_size: 10, audit_from: "2026-08-01T00:00:00.000Z", audit_to: account.createdAt })).toMatchObject({ extraTotal: 0 });
  });
});
