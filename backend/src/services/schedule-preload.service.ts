import { ERROR_CODES } from "../constants/error-codes";
import type { AuthRepositoryPort } from "../repositories/auth.repository";
import type {
  BookingRepositoryPort,
  ScheduleSlotPayload
} from "../repositories/booking.repository";
import type { MerchantShopContextRepositoryPort } from "../repositories/merchant-shop-context.repository";
import type { PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/app-error";
import type { AuthenticatedAccessContext } from "./auth.service";
import {
  resolveFormalMerchantIdentityKind,
  resolveMerchantShopScope
} from "./merchant-shop-scope";

export interface SchedulePreloadInput {
  from: Date;
  to: Date;
  page?: number;
  pageSize?: number;
}

export interface MerchantSchedulePreloadPayload extends PaginatedResponse<ScheduleSlotPayload> {
  identityId: number;
  shopId: number;
}

export interface TechnicianSchedulePreloadPayload extends PaginatedResponse<ScheduleSlotPayload> {
  identityId: number;
  technicianProfileId: number;
}

export interface SchedulePreloadPayload {
  fetchedAt: string;
  merchant: MerchantSchedulePreloadPayload | null;
  technician: TechnicianSchedulePreloadPayload | null;
}

type IdentityRepository = Pick<AuthRepositoryPort, "findUserById">;
type ScheduleRepository = Pick<BookingRepositoryPort, "listScheduleSlots">;

export class SchedulePreloadService {
  public constructor(
    private readonly identityRepository: IdentityRepository,
    private readonly merchantShopRepository: MerchantShopContextRepositoryPort,
    private readonly scheduleRepository: ScheduleRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async preload(
    actor: AuthenticatedAccessContext,
    input: SchedulePreloadInput
  ): Promise<SchedulePreloadPayload> {
    const user = await this.identityRepository.findUserById(actor.userId);
    if (!user) {
      throw new AppError({
        code: ERROR_CODES.TOKEN_INVALID,
        message: "error.token.invalid",
        statusCode: 401
      });
    }
    if (!user.isActive || user.deletedAt !== null) {
      throw new AppError({
        code: ERROR_CODES.ACCOUNT_DISABLED,
        message: "error.account.disabled",
        statusCode: 403
      });
    }

    const identities = user.identities.filter(
      (identity) => identity.isActive && identity.deletedAt === null
    );
    const technicianIdentity = actor.permissions.includes("page:technician-app")
      ? identities.find(
          (identity) =>
            identity.type === "technician" &&
            identity.scopeType === "technician_profile" &&
            typeof identity.scopeId === "number" &&
            Number.isSafeInteger(identity.scopeId) &&
            identity.scopeId > 0
        )
      : undefined;
    const merchantIdentity = actor.permissions.includes("page:merchant-app")
      ? identities.find((identity) => {
          try {
            return resolveFormalMerchantIdentityKind(identity) !== null;
          } catch {
            return false;
          }
        })
      : undefined;
    const fetchedAt = this.now();
    const merchantScope =
      merchantIdentity &&
      merchantIdentity.id === actor.currentIdentityId &&
      actor.selectedMerchantShopId &&
      actor.selectedMerchantShopPublicId
        ? {
            shopId: actor.selectedMerchantShopId,
            shopPublicId: actor.selectedMerchantShopPublicId
          }
        : merchantIdentity
          ? await resolveMerchantShopScope({
              repository: this.merchantShopRepository,
              identity: merchantIdentity,
              now: fetchedAt
            })
          : null;

    const [merchantPage, technicianPage] = await Promise.all([
      merchantIdentity && merchantScope
        ? this.scheduleRepository.listScheduleSlots({
            scope: "merchant",
            shopId: merchantScope.shopId,
            from: input.from,
            to: input.to,
            page: input.page,
            pageSize: input.pageSize
          })
        : null,
      technicianIdentity
        ? this.scheduleRepository.listScheduleSlots({
            scope: "technician",
            technicianProfileId: technicianIdentity.scopeId as number,
            from: input.from,
            to: input.to,
            page: input.page,
            pageSize: input.pageSize
          })
        : null
    ]);

    return {
      fetchedAt: fetchedAt.toISOString(),
      merchant:
        merchantIdentity && merchantScope && merchantPage
          ? {
              identityId: merchantIdentity.id,
              shopId: merchantScope.shopId,
              ...merchantPage
            }
          : null,
      technician:
        technicianIdentity && technicianPage
          ? {
              identityId: technicianIdentity.id,
              technicianProfileId: technicianIdentity.scopeId as number,
              ...technicianPage
            }
          : null
    };
  }
}
