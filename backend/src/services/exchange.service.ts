import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { AuthenticatedAccessContext } from "./auth.service";
import type {
  ExchangeCommentPage,
  ExchangeCommentPayload,
  ExchangeInteractionCounts,
  ExchangePostPage,
  ExchangePostPayload,
  ExchangePostType
} from "../types/exchange.types";
import { AppError } from "../utils/app-error";
import type { PaginationInput } from "../utils/pagination";
import type {
  CreateExchangeCommentBody,
  PublishExchangePostBody
} from "../validators/exchange.validators";
import { exchangeIdempotencyKeySchema } from "../validators/exchange.validators";

export interface ExchangeActorLookup {
  userId: number;
  identityId: number;
  identityType: string;
  scopeType: string | null;
  scopeId: number | null;
  publicId: string;
}

export interface ExchangeActorRecord extends ExchangeActorLookup {
  displayName: string;
  avatarUrl: string | null;
}

export interface ExchangeFeedListInput {
  type: ExchangePostType;
  page: number;
  pageSize: number;
}

export type ExchangeMutationResult<TValue> =
  | { kind: "success" | "replayed"; value: TValue }
  | { kind: "not_found" | "forbidden" | "unavailable" };

interface ExchangeMutationBase {
  actor: ExchangeActorRecord;
  postId: number;
  idempotencyKey: string;
  audit: AuditLogCreateInput;
  now: Date;
}

export interface ExchangePublishRepositoryInput {
  actor: ExchangeActorRecord;
  input: PublishExchangePostBody;
  idempotencyKey: string;
  audit: AuditLogCreateInput;
  now: Date;
}

export type ExchangeWithdrawRepositoryInput = ExchangeMutationBase;

export interface ExchangeCommentRepositoryInput extends ExchangeMutationBase {
  input: CreateExchangeCommentBody;
}

export interface ExchangeLikeRepositoryInput extends ExchangeMutationBase {
  liked: boolean;
}

export type ExchangeShareRepositoryInput = ExchangeMutationBase;

export interface ExchangeRepositoryPort {
  resolveActor(input: ExchangeActorLookup): Promise<ExchangeActorRecord | null>;
  listPosts(input: {
    type: ExchangePostType;
    page: number;
    pageSize: number;
    viewerUserId: number;
    authorUserId?: number;
    now: Date;
  }): Promise<ExchangePostPage>;
  findPostById(
    postId: number,
    viewerUserId: number,
    now: Date
  ): Promise<ExchangePostPayload | null>;
  listComments(
    postId: number,
    input: { page: number; pageSize: number }
  ): Promise<ExchangeCommentPage>;
  publishPost(
    input: ExchangePublishRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangePostPayload>>;
  withdrawPost(
    input: ExchangeWithdrawRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangePostPayload>>;
  createComment(
    input: ExchangeCommentRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeCommentPayload>>;
  setLike(
    input: ExchangeLikeRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>>;
  recordShare(
    input: ExchangeShareRepositoryInput
  ): Promise<ExchangeMutationResult<ExchangeInteractionCounts>>;
  expireDue(now: Date, batchSize: number): Promise<number>;
}

const INTELLIGENCE_PUBLISHER_IDENTITIES = new Set([
  "technician",
  "merchant",
  "merchant_owner",
  "merchant_staff"
]);

const DEMAND_AUDIENCE_IDENTITIES = new Set([
  "technician",
  "merchant",
  "merchant_owner",
  "merchant_staff"
]);

export class ExchangeService {
  public constructor(
    private readonly repository: ExchangeRepositoryPort,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listPosts(
    access: AuthenticatedAccessContext,
    input: ExchangeFeedListInput
  ): Promise<ExchangePostPage> {
    const actor = await this.resolveActor(access);
    const privateAuthorUserId =
      input.type === "demand" && !DEMAND_AUDIENCE_IDENTITIES.has(actor.identityType)
        ? actor.userId
        : undefined;
    return this.repository.listPosts({
      ...input,
      viewerUserId: actor.userId,
      ...(privateAuthorUserId ? { authorUserId: privateAuthorUserId } : {}),
      now: this.now()
    });
  }

  public async getPost(
    access: AuthenticatedAccessContext,
    postId: number
  ): Promise<ExchangePostPayload> {
    const actor = await this.resolveActor(access);
    const post = await this.repository.findPostById(postId, actor.userId, this.now());
    if (!post) throw this.postNotFound();
    this.assertCanReadPost(actor, post);
    return post;
  }

  public async publish(
    access: AuthenticatedAccessContext,
    input: PublishExchangePostBody,
    key: string
  ): Promise<ExchangePostPayload> {
    const actor = await this.resolveActor(access);
    this.assertCanPublish(actor.identityType, input.type);
    const idempotencyKey = exchangeIdempotencyKeySchema.parse(key);
    const result = await this.repository.publishPost({
      actor,
      input,
      idempotencyKey,
      now: this.now(),
      audit: this.audit(access, "exchange.post.publish", null, {
        identityId: actor.identityId,
        identityType: actor.identityType,
        postType: input.type
      })
    });
    return this.unwrapMutation(result);
  }

  public async withdraw(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangePostPayload> {
    const actor = await this.resolveActor(access);
    const result = await this.repository.withdrawPost({
      actor,
      postId,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, "exchange.post.withdraw", postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  public async listComments(
    access: AuthenticatedAccessContext,
    postId: number,
    input: PaginationInput
  ): Promise<ExchangeCommentPage> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    return this.repository.listComments(postId, {
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 20
    });
  }

  public async comment(
    access: AuthenticatedAccessContext,
    postId: number,
    input: CreateExchangeCommentBody,
    key: string
  ): Promise<ExchangeCommentPayload> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.createComment({
      actor,
      postId,
      input,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, "exchange.post.comment", postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  public like(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    return this.setLike(access, postId, key, true);
  }

  public unlike(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    return this.setLike(access, postId, key, false);
  }

  public async share(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string
  ): Promise<ExchangeInteractionCounts> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.recordShare({
      actor,
      postId,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, "exchange.post.share", postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  public expireDue(now: Date, batchSize: number): Promise<number> {
    return this.repository.expireDue(now, batchSize);
  }

  private async setLike(
    access: AuthenticatedAccessContext,
    postId: number,
    key: string,
    liked: boolean
  ): Promise<ExchangeInteractionCounts> {
    const actor = await this.resolveActor(access);
    await this.assertPostReadable(actor, postId);
    const result = await this.repository.setLike({
      actor,
      postId,
      liked,
      idempotencyKey: exchangeIdempotencyKeySchema.parse(key),
      now: this.now(),
      audit: this.audit(access, `exchange.post.${liked ? "like" : "unlike"}`, postId, {
        identityId: actor.identityId
      })
    });
    return this.unwrapMutation(result);
  }

  private async resolveActor(access: AuthenticatedAccessContext): Promise<ExchangeActorRecord> {
    if (!access.currentIdentityId || !access.currentIdentityType || !access.currentPublicId) {
      throw this.identityForbidden();
    }
    const lookup: ExchangeActorLookup = {
      userId: access.userId,
      identityId: access.currentIdentityId,
      identityType: access.currentIdentityType,
      scopeType: access.currentIdentityScopeType ?? null,
      scopeId: access.currentIdentityScopeId ?? null,
      publicId: access.currentPublicId
    };
    const actor = await this.repository.resolveActor(lookup);
    if (
      !actor ||
      actor.userId !== lookup.userId ||
      actor.identityId !== lookup.identityId ||
      actor.identityType !== lookup.identityType ||
      actor.scopeType !== lookup.scopeType ||
      actor.scopeId !== lookup.scopeId ||
      actor.publicId !== lookup.publicId
    ) {
      throw this.identityForbidden();
    }
    return actor;
  }

  private assertCanPublish(identityType: string, postType: ExchangePostType): void {
    const allowed =
      (identityType === "customer" && postType === "demand") ||
      (INTELLIGENCE_PUBLISHER_IDENTITIES.has(identityType) && postType === "intelligence");
    if (!allowed) throw this.identityForbidden();
  }

  private async assertPostReadable(actor: ExchangeActorRecord, postId: number): Promise<void> {
    const post = await this.repository.findPostById(postId, actor.userId, this.now());
    if (!post) throw this.postNotFound();
    this.assertCanReadPost(actor, post);
  }

  private assertCanReadPost(actor: ExchangeActorRecord, post: ExchangePostPayload): void {
    if (post.type !== "demand") return;
    if (post.viewer.canWithdraw || DEMAND_AUDIENCE_IDENTITIES.has(actor.identityType)) return;
    throw this.postNotFound();
  }

  private unwrapMutation<TValue>(result: ExchangeMutationResult<TValue>): TValue {
    if (result.kind === "success" || result.kind === "replayed") return result.value;
    if (result.kind === "not_found") throw this.postNotFound();
    if (result.kind === "forbidden") {
      throw new AppError({
        code: ERROR_CODES.FORBIDDEN,
        message: "error.exchange.author_required",
        statusCode: 403
      });
    }
    throw new AppError({
      code: ERROR_CODES.ORDER_INVALID_TRANSITION,
      message: "error.exchange.post_unavailable",
      statusCode: 409
    });
  }

  private audit(
    access: AuthenticatedAccessContext,
    action: string,
    targetId: number | null,
    metadata: Record<string, unknown>
  ): AuditLogCreateInput {
    return {
      actorId: access.userId,
      action,
      targetType: "ExchangePost",
      targetId,
      metadata
    };
  }

  private identityForbidden(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private postNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.exchange.post_not_found",
      statusCode: 404
    });
  }
}
