import { httpClient } from "../../api/httpClient";
import type {
  CreateExchangeClaimInput,
  ExchangeClaim,
  ExchangeClaimMine,
  ExchangeClaimOption,
  ExchangeClaimOptionListInput,
  ExchangeComment,
  ExchangeInteractionCounts,
  ExchangeListInput,
  ExchangeMatching,
  ExchangePost,
  ExchangeRequestPublicationContext,
  Paginated,
  PaginationInput,
  PublishExchangePostInput,
  SelectExchangeMatchingInput
} from "./types";

const idempotencyHeaders = (key: string) => ({ "Idempotency-Key": key });

export function listExchangePosts(input: ExchangeListInput): Promise<Paginated<ExchangePost>> {
  return httpClient.request<Paginated<ExchangePost>>("/exchange/posts", {
    query: {
      type: input.type,
      page: input.page ?? 1,
      page_size: input.pageSize ?? 20
    },
    signal: input.signal
  });
}

export function getExchangePost(postId: string, signal?: AbortSignal): Promise<ExchangePost> {
  return httpClient.request<ExchangePost>(`/exchange/posts/${postId}`, { signal });
}

export function listExchangeClaimOptions(
  postId: string,
  input: ExchangeClaimOptionListInput = {}
): Promise<Paginated<ExchangeClaimOption>> {
  return httpClient.request<Paginated<ExchangeClaimOption>>(
    `/exchange/posts/${postId}/claim-options`,
    {
      query: {
        page: input.page ?? 1,
        page_size: input.pageSize ?? 20,
        shop_id: input.shopId,
        technician_profile_id: input.technicianProfileId,
        service_ref: input.serviceRef
      },
      signal: input.signal
    }
  );
}

export function createExchangeClaim(
  postId: string,
  input: CreateExchangeClaimInput,
  key: string
): Promise<ExchangeClaim> {
  return httpClient.request<ExchangeClaim>(`/exchange/posts/${postId}/claims`, {
    body: input,
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export function listReceivedExchangeClaims(
  postId: string,
  input: PaginationInput = {}
): Promise<Paginated<ExchangeClaim>> {
  return httpClient.request<Paginated<ExchangeClaim>>(`/exchange/posts/${postId}/claims`, {
    query: { page: input.page ?? 1, page_size: input.pageSize ?? 20 },
    signal: input.signal
  });
}

export function getExchangeMatching(
  postId: string,
  signal?: AbortSignal
): Promise<ExchangeMatching> {
  return httpClient.request<ExchangeMatching>(`/exchange/posts/${postId}/matching`, { signal });
}

export function selectExchangeMatching(
  postId: string,
  input: SelectExchangeMatchingInput,
  key: string
): Promise<ExchangeMatching> {
  return httpClient.request<ExchangeMatching>(`/exchange/posts/${postId}/matching/select`, {
    body: input,
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export async function getMyExchangeClaim(
  postId: string,
  signal?: AbortSignal
): Promise<ExchangeClaim | null> {
  const payload = await httpClient.request<ExchangeClaimMine>(
    `/exchange/posts/${postId}/claims/mine`,
    {
      signal
    }
  );
  return payload.claim;
}

export function withdrawExchangeClaim(claimId: string, key: string): Promise<ExchangeClaim> {
  return httpClient.request<ExchangeClaim>(`/exchange/claims/${claimId}/withdraw`, {
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export function getRequestPublicationContext(): Promise<ExchangeRequestPublicationContext> {
  return httpClient.request<ExchangeRequestPublicationContext>("/exchange/request-publication-context");
}

export function publishExchangePost(input: PublishExchangePostInput, key: string): Promise<ExchangePost> {
  return httpClient.request<ExchangePost>("/exchange/posts", {
    body: input,
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export function withdrawExchangePost(postId: string, key: string): Promise<ExchangePost> {
  return httpClient.request<ExchangePost>(`/exchange/posts/${postId}/withdraw`, {
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export function listExchangeComments(
  postId: string,
  input: PaginationInput = {}
): Promise<Paginated<ExchangeComment>> {
  return httpClient.request<Paginated<ExchangeComment>>(`/exchange/posts/${postId}/comments`, {
    query: {
      page: input.page ?? 1,
      page_size: input.pageSize ?? 20
    },
    signal: input.signal
  });
}

export function createExchangeComment(
  postId: string,
  content: string,
  key: string
): Promise<ExchangeComment> {
  return httpClient.request<ExchangeComment>(`/exchange/posts/${postId}/comments`, {
    body: { content },
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}

export function likeExchangePost(postId: string, key: string): Promise<ExchangeInteractionCounts> {
  return httpClient.request<ExchangeInteractionCounts>(`/exchange/posts/${postId}/like`, {
    headers: idempotencyHeaders(key),
    method: "PUT"
  });
}

export function unlikeExchangePost(postId: string, key: string): Promise<ExchangeInteractionCounts> {
  return httpClient.request<ExchangeInteractionCounts>(`/exchange/posts/${postId}/like`, {
    headers: idempotencyHeaders(key),
    method: "DELETE"
  });
}

export function recordExchangeShare(postId: string, key: string): Promise<ExchangeInteractionCounts> {
  return httpClient.request<ExchangeInteractionCounts>(`/exchange/posts/${postId}/shares`, {
    headers: idempotencyHeaders(key),
    method: "POST"
  });
}
