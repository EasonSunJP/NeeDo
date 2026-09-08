import { ApiClientError, httpClient, type ApiQueryValue } from "./httpClient";
import { requireLiveDashboardEvent, type LiveDashboardEvent } from "./liveDashboard";
import { z } from "zod";

const MAX_EVENT_BYTES = 64 * 1024;
const connectedFrameSchema = z.strictObject({
  type: z.literal("connected"),
  scope: z.strictObject({
    countryCode: z.literal("JP"),
    admin1Code: z.string().regex(/^\d{2}$/u).nullable(),
    admin2Code: z.string().regex(/^\d{5}$/u).nullable()
  }).superRefine((scope, context) => {
    if (scope.admin2Code && !scope.admin1Code) {
      context.addIssue({ code: "custom", message: "admin1 required" });
    }
  }),
  payload: z.strictObject({}),
  createdAt: z.string().datetime({ offset: true })
});

export interface AuthenticatedSseOptions {
  path: string;
  query: Record<string, ApiQueryValue>;
  signal: AbortSignal;
  lastEventId?: string | null;
  onOpen?: () => void;
  onEvent: (event: LiveDashboardEvent) => void;
}

export async function openAuthenticatedSseStream(options: AuthenticatedSseOptions): Promise<void> {
  const response = await httpClient.openStream(options.path, {
    headers: {
      Accept: "text/event-stream",
      ...(options.lastEventId ? { "Last-Event-ID": options.lastEventId } : {})
    },
    query: options.query,
    signal: options.signal
  });
  if (!response.ok || !response.body) {
    throw new ApiClientError("error.dashboard.stream_unavailable", response.status || 502, response.status || 502);
  }
  options.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";
  let eventId = "";
  let dataLines: string[] = [];
  let eventBytes = 0;

  const reset = () => {
    eventType = "";
    eventId = "";
    dataLines = [];
    eventBytes = 0;
  };
  const dispatch = () => {
    if (dataLines.length === 0) {
      reset();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(dataLines.join("\n"));
    } catch {
      throw new Error("error.dashboard.invalid_event");
    }
    if (eventType === "connected") {
      if (eventId || !connectedFrameSchema.safeParse(parsed).success) {
        throw new Error("error.dashboard.invalid_event");
      }
      reset();
      return;
    }
    const event = requireLiveDashboardEvent(parsed);
    if ((eventType && event.type !== eventType) || (eventId && event.id !== eventId)) {
      throw new Error("error.dashboard.invalid_event");
    }
    options.onEvent(event);
    reset();
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (new TextEncoder().encode(buffer).byteLength + eventBytes > MAX_EVENT_BYTES) {
        throw new Error("error.dashboard.event_too_large");
      }
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const rawLine = buffer.slice(0, newline).replace(/\r$/u, "");
        buffer = buffer.slice(newline + 1);
        eventBytes += new TextEncoder().encode(rawLine).byteLength + 1;
        if (eventBytes > MAX_EVENT_BYTES) throw new Error("error.dashboard.event_too_large");
        if (rawLine === "") dispatch();
        else if (!rawLine.startsWith(":")) {
          const separator = rawLine.indexOf(":");
          const field = separator === -1 ? rawLine : rawLine.slice(0, separator);
          const valueText = separator === -1 ? "" : rawLine.slice(separator + 1).replace(/^ /u, "");
          if (field === "event") eventType = valueText;
          else if (field === "id") eventId = valueText;
          else if (field === "data") dataLines.push(valueText);
        }
        newline = buffer.indexOf("\n");
      }
      if (done) {
        if (buffer) {
          eventBytes += new TextEncoder().encode(buffer).byteLength;
          if (eventBytes > MAX_EVENT_BYTES) throw new Error("error.dashboard.event_too_large");
        }
        if (dataLines.length > 0) dispatch();
        return;
      }
    }
  } catch (error) {
    if (options.signal.aborted && error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  } finally {
    reader.releaseLock();
  }
}
