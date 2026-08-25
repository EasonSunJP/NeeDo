import { describe, expect, it, jest } from "@jest/globals";
import type {
  CustomerProfileRepositoryPort,
  CustomerProfilePayload
} from "../src/repositories/customer-profile.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import type { CustomerAvatarStoragePort } from "../src/services/customer-avatar.storage";
import { CustomerProfileService } from "../src/services/customer-profile.service";

const updatedProfile: CustomerProfilePayload = {
  id: 41,
  userId: 11,
  displayName: "松尾 雄大",
  city: "Tokyo",
  membershipLevel: "standard",
  avatarUrl: null,
  gender: "private",
  age: null,
  heightCm: null,
  languages: ["日本語", "English"],
  bio: null,
  visibility: "network",
  isPublic: false,
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z"
};

const requestContext: AuthRequestContext = { ip: "127.0.0.1", userAgent: "jest" };

const repository = (): jest.Mocked<CustomerProfileRepositoryPort> => ({
  findMine: jest.fn(),
  updateMine: jest.fn()
});

const audit = { record: jest.fn<() => Promise<void>>() };

const storage = (): jest.Mocked<CustomerAvatarStoragePort> => ({ save: jest.fn() });

describe("CustomerProfileService", () => {
  it("updates only the current customer identity and audits changed fields", async () => {
    const actor = {
      userId: 11,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 41
    } as AuthenticatedAccessContext;
    const customerRepository = repository();
    customerRepository.updateMine.mockResolvedValue(updatedProfile);
    const service = new CustomerProfileService(customerRepository, audit, storage());

    await service.updateMine(actor, requestContext, {
      displayName: "松尾 雄大",
      languages: ["日本語", "English"],
      visibility: "network"
    });

    expect(customerRepository.updateMine).toHaveBeenCalledWith(
      11,
      41,
      expect.objectContaining({
        displayName: "松尾 雄大",
        isPublic: false,
        visibility: "network"
      })
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "customer_profile.self_update",
        targetId: 41,
        metadata: { changedFields: ["displayName", "languages", "visibility"] }
      })
    );
  });

  it("saves an avatar before updating the current profile and excludes its data URL from audit", async () => {
    const actor = {
      userId: 11,
      currentIdentityType: "customer",
      currentIdentityScopeType: "customer_profile",
      currentIdentityScopeId: 41
    } as AuthenticatedAccessContext;
    const customerRepository = repository();
    const customerStorage = storage();
    customerStorage.save.mockResolvedValue({
      absolutePath: "/private/tmp/avatar.png",
      mimeType: "image/png",
      url: "http://localhost:3000/media/customer-avatars/avatar.png"
    });
    customerRepository.updateMine.mockResolvedValue({
      ...updatedProfile,
      avatarUrl: "http://localhost:3000/media/customer-avatars/avatar.png"
    });
    const service = new CustomerProfileService(customerRepository, audit, customerStorage);
    const avatarDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

    await service.updateMine(actor, requestContext, { avatarDataUrl });

    expect(customerStorage.save).toHaveBeenCalledWith(avatarDataUrl);
    expect(customerRepository.updateMine).toHaveBeenCalledWith(11, 41, {
      avatar: {
        mimeType: "image/png",
        url: "http://localhost:3000/media/customer-avatars/avatar.png"
      }
    });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: { changedFields: ["avatar"] }
      })
    );
  });

  it("rejects a non-customer identity before repository access", async () => {
    const customerRepository = repository();
    const service = new CustomerProfileService(customerRepository, audit, storage());

    await expect(
      service.getMine({
        userId: 9,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 7
      } as AuthenticatedAccessContext)
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(customerRepository.findMine).not.toHaveBeenCalled();
  });
});
