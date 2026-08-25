import { AffiliateLinkTokenService } from "../src/services/affiliate-link-token.service";

describe("AffiliateLinkTokenService", () => {
  const subject = {
    taskId: 22,
    userId: 33,
    expiresAt: new Date("2026-10-01T00:00:00.000Z")
  };

  const createService = (): AffiliateLinkTokenService =>
    new AffiliateLinkTokenService({
      secret: "affiliate-test-secret-with-at-least-32-characters",
      publicBaseUrl: "https://app.needo.test/afirieito/"
    });

  const tamperLastCharacter = (value: string): string =>
    `${value.slice(0, -1)}${value.endsWith("0") ? "1" : "0"}`;

  it("issues an opaque signed promotion URL that can be rebuilt after refresh", () => {
    const service = createService();
    const issued = service.issue(subject);
    const rebuilt = service.rebuild({
      ...subject,
      publicTokenId: issued.publicTokenId
    });

    expect(rebuilt).toEqual(issued);
    expect(issued.publicTokenId).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(issued.publicToken).toMatch(/^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.promotionUrl).toBe(
      `https://app.needo.test/afirieito/r/${encodeURIComponent(issued.publicToken)}`
    );
    expect(issued.publicToken).not.toContain(String(subject.taskId));
    expect(issued.publicToken).not.toContain(String(subject.userId));
  });

  it("verifies the canonical token and rejects token or hash tampering", () => {
    const service = createService();
    const issued = service.issue(subject);
    const verification = {
      ...subject,
      publicTokenId: issued.publicTokenId,
      publicToken: issued.publicToken,
      tokenHash: issued.tokenHash
    };

    expect(service.verify(verification)).toBe(true);
    expect(
      service.verify({
        ...verification,
        publicToken: tamperLastCharacter(issued.publicToken)
      })
    ).toBe(false);
    expect(
      service.verify({
        ...verification,
        tokenHash: tamperLastCharacter(issued.tokenHash)
      })
    ).toBe(false);
    expect(
      service.verify({
        ...verification,
        taskId: verification.taskId + 1
      })
    ).toBe(false);
  });
});
