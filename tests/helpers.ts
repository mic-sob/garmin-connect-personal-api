import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { JsonValue, QueryParams } from "../src/shared.ts";
import type { Logger, LogLevel } from "../src/logger.ts";

export interface FetchCall {
  method: string;
  url: string;
  init?: RequestInit;
}

export class StubFetch {
  readonly calls: FetchCall[] = [];
  readonly responses = new Map<string, Response>();
  private readonly fallback: Response | undefined;

  constructor(fallback?: Response, responses?: Record<string, Response>) {
    this.fallback = fallback;
    for (const [url, response] of Object.entries(responses ?? {})) {
      this.responses.set(url, response);
    }
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    this.calls.push({ method: init?.method ?? "GET", url, init });
    const response = this.responses.get(url) ?? this.fallback;
    if (!response) {
      throw new Error(`No stub response configured for ${url}`);
    }
    return response;
  };
}

export function makeResponse(payload: JsonValue, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function makeTextResponse(text: string, status = 200): Response {
  return new Response(text, { status });
}

export function makeEmptyResponse(status = 204): Response {
  return new Response(null, { status });
}

export function makeBytesResponse(
  bytes: Uint8Array,
  options: { status?: number; contentType?: string } = {},
): Response {
  return new Response(bytes, {
    status: options.status ?? 200,
    headers: { "Content-Type": options.contentType ?? "application/json" },
  });
}

export function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

export function makeJwt(payload: object): string {
  return `${base64url(JSON.stringify({ alg: "none" }))}.${base64url(
    JSON.stringify(payload),
  )}.signature`;
}

export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "garmin-api-test-"));
}

export interface CapturedLogger {
  logger: Logger;
  messages: string[];
}

export function captureLogger(level: LogLevel = "info"): CapturedLogger {
  const messages: string[] = [];
  const logger: Logger = {
    debug: (message) => {
      if (level === "debug") messages.push(message);
    },
    info: (message) => {
      if (level === "debug" || level === "info") messages.push(message);
    },
    warn: (message) => messages.push(message),
  };
  return { logger, messages };
}

export function qs(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }
    } else {
      search.append(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}
