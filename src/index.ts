/** Garmin Personal API client library. */

export {
  DEFAULT_API_KEY_FILE,
  DEFAULT_BASE_URL,
  DEFAULT_BEARER_TOKEN_CACHE_FILE,
  DEFAULT_TIMEOUT_SECONDS,
  TOKEN_PATH,
} from "./constants.js";

export { GarminPersonalApiError, HttpError } from "./errors.js";
export type { HttpErrorOptions } from "./errors.js";

export { createLogger } from "./logger.js";
export type { Logger, LogLevel } from "./logger.js";

export { FileTokenCache, PersonalApiAuthenticator } from "./auth.js";
export type {
  BearerToken,
  FileTokenCacheOptions,
  PersonalApiAuthenticatorOptions,
  TokenCache,
} from "./auth.js";

export { GarminPersonalApiClient } from "./client.js";
export type { GarminPersonalApiClientOptions, GetJson, SearchActivitiesOptions } from "./client.js";

export { resolveApiKey } from "./apiKeys.js";
export type { ResolveApiKeyOptions } from "./apiKeys.js";

export type { DateString, JsonValue, QueryParam, QueryParams } from "./shared.js";

export type { components, paths } from "./types/garmin.js";
