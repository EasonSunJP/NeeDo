import { ERROR_CODES } from "../src/constants/error-codes";
import {
  GoogleCredentialVerifierService,
  type GoogleTicketClient
} from "../src/services/google-credential-verifier.service";

interface GooglePayload {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  nonce?: string;
  name?: string;
  picture?: string;
}

const expectedNonce = "one-time-nonce";
const validPayload: GooglePayload = {
  sub: "google-subject-123",
  email: "Verified.User@Example.COM",
  email_verified: true,
  nonce: expectedNonce,
  name: "Verified User",
  picture: "https://lh3.googleusercontent.com/avatar"
};

const createClient = (
  response: GooglePayload | Error = validPayload
): jest.Mocked<GoogleTicketClient> => ({
  verifyIdToken: jest.fn().mockImplementation(async () => {
    if (response instanceof Error) throw response;
    return { getPayload: () => response };
  })
});

const createVerifier = (
  client: GoogleTicketClient,
  verifyTimeoutMs = 100
): GoogleCredentialVerifierService =>
  new GoogleCredentialVerifierService(client, {
    GOOGLE_AUTH_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
    GOOGLE_AUTH_VERIFY_TIMEOUT_MS: verifyTimeoutMs
  });

describe("GoogleCredentialVerifierService", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("verifies the configured audience and returns a normalized verified identity", async () => {
    const client = createClient();

    await expect(
      createVerifier(client).verify({ credential: "google-id-token", expectedNonce })
    ).resolves.toEqual({
      subject: "google-subject-123",
      email: "verified.user@example.com",
      emailVerifiedAt: expect.any(Date),
      name: "Verified User",
      pictureUrl: "https://lh3.googleusercontent.com/avatar"
    });
    expect(client.verifyIdToken).toHaveBeenCalledWith({
      idToken: "google-id-token",
      audience: "test-google-client-id.apps.googleusercontent.com"
    });
  });

  it.each([
    ["missing subject", { ...validPayload, sub: undefined }],
    ["blank subject", { ...validPayload, sub: "   " }],
    ["missing email", { ...validPayload, email: undefined }],
    ["blank email", { ...validPayload, email: "   " }],
    ["unverified email", { ...validPayload, email_verified: false }]
  ])("rejects a credential with %s", async (_label, payload) => {
    await expect(
      createVerifier(createClient(payload)).verify({ credential: "google-id-token", expectedNonce })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_credential_invalid",
      statusCode: 401
    });
  });

  it.each([
    ["invalid audience", new Error("audience is invalid")],
    ["invalid issuer", new Error("issuer is invalid")],
    ["expired credential", new Error("token is expired")]
  ])("maps provider rejection for %s to a stable credential error", async (_label, error) => {
    await expect(
      createVerifier(createClient(error)).verify({ credential: "google-id-token", expectedNonce })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_credential_invalid",
      statusCode: 401
    });
  });

  it("sanitizes a ticket payload-access exception", async () => {
    const client: GoogleTicketClient = {
      verifyIdToken: jest.fn().mockResolvedValue({
        getPayload: () => {
          throw new Error("sensitive ticket payload failure");
        }
      })
    };

    const failure = await createVerifier(client)
      .verify({ credential: "google-id-token", expectedNonce })
      .then(
        () => undefined,
        (error: unknown) => error
      );

    expect(failure).toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_credential_invalid",
      statusCode: 401
    });
    expect(failure).toHaveProperty("cause", undefined);
    expect(failure).not.toHaveProperty("credential");
    expect(failure).not.toHaveProperty("subject");
    expect(String(failure)).not.toContain("sensitive ticket payload failure");
  });

  it("maps a verification timeout to a stable credential error", async () => {
    jest.useFakeTimers();
    const neverSettlingClient: GoogleTicketClient = {
      verifyIdToken: jest.fn(() => new Promise<never>(() => undefined))
    };
    const verification = expect(
      createVerifier(neverSettlingClient, 1).verify({
        credential: "google-id-token",
        expectedNonce
      })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_credential_invalid",
      statusCode: 401
    });

    await jest.advanceTimersByTimeAsync(1);
    await verification;
  });

  it.each([
    ["missing nonce", { ...validPayload, nonce: undefined }],
    ["mismatched nonce", { ...validPayload, nonce: "other-nonce" }]
  ])("rejects a credential with %s", async (_label, payload) => {
    await expect(
      createVerifier(createClient(payload)).verify({ credential: "google-id-token", expectedNonce })
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_CREDENTIALS,
      message: "error.auth.google_nonce_invalid",
      statusCode: 401
    });
  });
});
