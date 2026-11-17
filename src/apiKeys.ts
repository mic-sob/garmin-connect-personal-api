/** Personal API key discovery. */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { DEFAULT_API_KEY_ENV_VAR, DEFAULT_API_KEY_FILE } from "./constants.js";
import { requireNonEmptyKey, warnIfReadableByOthers } from "./credentials.js";
import { GarminPersonalApiError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";

export interface ResolveApiKeyOptions {
  apiKey?: string;
  env?: Record<string, string | undefined>;
  envVar?: string;
  keyFile?: string;
  /** Override the default key file path (mainly useful for testing). */
  defaultKeyFile?: string;
  logger?: Logger;
}

/**
 * Resolve an explicit key, the environment, then the default key file.
 *
 * An explicitly supplied `keyFile` overrides the environment, even when it
 * names the default file. Invalid explicit sources do not fall back to other
 * sources.
 */
export async function resolveApiKey(options: ResolveApiKeyOptions = {}): Promise<string> {
  const logger = options.logger ?? createLogger();

  if (options.apiKey !== undefined) {
    return requireNonEmptyKey(options.apiKey, "the explicit API key");
  }

  if (options.keyFile === undefined) {
    const env = options.env ?? process.env;
    const envVar = options.envVar ?? DEFAULT_API_KEY_ENV_VAR;
    const environmentValue = env[envVar];
    if (environmentValue !== undefined) {
      return requireNonEmptyKey(environmentValue, `environment variable ${envVar}`);
    }
  }

  const filePath = expandUser(options.keyFile ?? options.defaultKeyFile ?? DEFAULT_API_KEY_FILE);
  let fileValue: string;
  try {
    fileValue = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      if (options.keyFile !== undefined) {
        throw new GarminPersonalApiError(`Personal API key file ${filePath} does not exist.`);
      }
      throw new GarminPersonalApiError(
        `No personal API key was provided. Pass --api-key/api_key, set ${
          options.envVar ?? DEFAULT_API_KEY_ENV_VAR
        }, or create ${filePath}.`,
      );
    }
    throw error;
  }

  await warnIfReadableByOthers(filePath, "Personal API key file", logger);
  return requireNonEmptyKey(fileValue, `personal API key file ${filePath}`);
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
