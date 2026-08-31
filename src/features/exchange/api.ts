import { httpClient } from "../../api/httpClient";
import type {
  ExchangeComment,
  ExchangeInteractionCounts,
  ExchangeListInput,
  ExchangePost,
  ExchangeRequestPublicationContext,
  Paginated,
  PaginationInput,
  PublishExchangePostInput
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
