/** Bearer-token authentication and caching. */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import {
  BASE_URL_ENV_VAR,
  DEFAULT_BASE_URL,
  DEFAULT_BEARER_TOKEN_CACHE_FILE,
  DEFAULT_TIMEOUT_SECONDS,
  TOKEN_PATH,
} from "./constants.js";
import { requireNonEmptyKey, warnIfReadableByOthers } from "./credentials.js";
import { GarminPersonalApiError, HttpError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";

/** A bearer token and its expiration time in seconds since the epoch. */
export interface BearerToken {
  accessToken: string;
  /** Expiration time in seconds since the Unix epoch. */
  expiresAt: number;
}

/** Storage for cached bearer tokens. */
export interface TokenCache {
  read(fingerprint: string): Promise<BearerToken | null>;
  write(fingerprint: string, token: BearerToken): Promise<void>;
}

export interface FileTokenCacheOptions {
  filePath?: string;
  logger?: Logger;
}

/**
 * Filesystem-backed token cache, byte-compatible with Garmin's own Python
 * client: same default path and same JSON shape.
 */
export class FileTokenCache implements TokenCache {
  private readonly filePath: string;
  private readonly logger: Logger;

  constructor(options: FileTokenCacheOptions = {}) {
    this.filePath = expandUser(options.filePath ?? DEFAULT_BEARER_TOKEN_CACHE_FILE);
    this.logger = options.logger ?? createLogger();
  }

  async read(fingerprint: string): Promise<BearerToken | null> {
    let serialized: string;
    try {
      serialized = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        this.logger.info("No cached bearer token found; requesting a new token");
        return null;
      }
      throw error;
    }

    await warnIfReadableByOthers(this.filePath, "Bearer-token cache file", this.logger);

    try {
      const cache = JSON.parse(serialized) as {
        fingerprint?: unknown;
        access_token?: unknown;
        expires_at?: unknown;
      };
      if (cache.fingerprint !== fingerprint) {
        this.logger.info(
          "Cached bearer token fingerprint does not match the current API key or base URL; requesting a new token",
        );
        return null;
      }
      if (typeof cache.access_token !== "string") {
        throw new TypeError("missing access_token");
      }
      const expiresAt = Number(cache.expires_at);
      if (!Number.isFinite(expiresAt)) {
        throw new TypeError("missing expires_at");
      }
      return { accessToken: cache.access_token, expiresAt };
    } catch {
      this.logger.warn(`Ignoring invalid bearer-token cache file ${this.filePath}`);
      return null;
    }
  }

  async write(fingerprint: string, token: BearerToken): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const serialized = JSON.stringify({
      fingerprint,
      access_token: token.accessToken,
      expires_at: token.expiresAt,
    });
    await writeFile(this.filePath, serialized, { encoding: "utf8", mode: 0o600, flag: "w" });
  }
}

export interface PersonalApiAuthenticatorOptions {
  timeout?: number;
  fetch?: typeof fetch;
  tokenCache?: TokenCache;
  /** Returns the current time in seconds since the epoch. */
  clock?: () => number;
  logger?: Logger;
}

const BEARER_TOKEN_REFRESH_WINDOW_SECONDS = 60 * 60;

/** Exchange a Garmin Personal API key for a bearer token, caching the result. */
export class PersonalApiAuthenticator {
  readonly baseUrl: string;
  readonly timeout: number;

  private readonly fetchImpl: typeof fetch;
  private readonly tokenCache: TokenCache;
  private readonly clock: () => number;
  private readonly logger: Logger;

  constructor(options: PersonalApiAuthenticatorOptions = {}) {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_SECONDS;
    if (timeout <= 0) {
      throw new GarminPersonalApiError("timeout must be greater than zero");
    }
    this.baseUrl = (process.env[BASE_URL_ENV_VAR] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = timeout;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.logger = options.logger ?? createLogger();
    this.tokenCache = options.tokenCache ?? new FileTokenCache({ logger: this.logger });
    this.clock = options.clock ?? (() => Date.now() / 1000);
  }

  async obtainToken(
    apiKey: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<BearerToken> {
    if (typeof apiKey !== "string") {
      throw new GarminPersonalApiError(
        "An API key string is required; use resolveApiKey() to discover one.",
      );
    }
    const key = requireNonEmptyKey(apiKey, "the explicit API key");

    // Cached tokens are only reused for the same API key and environment.
    const fingerprint = createHash("sha256").update(`${this.baseUrl}\u0000${key}`).digest("hex");

    if (!options.forceRefresh) {
      const cached = await this.tokenCache.read(fingerprint);
      if (cached !== null) {
        if (cached.expiresAt - this.clock() > BEARER_TOKEN_REFRESH_WINDOW_SECONDS) {
          this.logger.info("Using cached bearer token");
          return cached;
        }
        this.logger.info(
          "Cached bearer token is expired or expires within the 1-hour refresh window; requesting a new token",
        );
      }
    }

    const url = `${this.baseUrl}${TOKEN_PATH}`;
    this.logger.info(`POST ${TOKEN_PATH}`);
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { Accept: "*/*", Authorization: `ApiKey ${key}` },
      signal: AbortSignal.timeout(this.timeout * 1000),
    });
    if (!response.ok) {
      throw new HttpError({
        statusCode: response.status,
        method: "POST",
        url,
        responseText: await response.text(),
      });
    }

    const accessToken = (await response.text()).trim();
    const token: BearerToken = {
      accessToken,
      expiresAt: jwtExpiration(accessToken),
    };
    await this.tokenCache.write(fingerprint, token);
    this.logger.info("Received and cached a new bearer token");
    return token;
  }
}

function expandUser(filePath: string): string {
  if (filePath === "~") {
    return homedir();
  }
  if (filePath.startsWith("~/")) {
    return path.join(homedir(), filePath.slice(2));
  }
  return filePath;
}

function jwtExpiration(accessToken: string): number {
  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload) {
      throw new Error("missing JWT payload");
    }
    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    if (typeof payload.exp !== "number" && typeof payload.exp !== "string") {
      throw new Error("missing exp claim");
    }
    return Number(payload.exp);
  } catch {
    throw new GarminPersonalApiError("The token endpoint did not return a JWT with an exp claim.");
  }
}
