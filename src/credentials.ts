/** Shared credential validation and file-permission checks. */

import { stat } from "node:fs/promises";

import { GarminPersonalApiError } from "./errors.js";
import type { Logger } from "./logger.js";

export function requireNonEmptyKey(value: string, source: string): string {
  const key = value.trim();
  if (!key) {
    throw new GarminPersonalApiError(`The value from ${source} is empty.`);
  }
  return key;
}

export async function warnIfReadableByOthers(
  filePath: string,
  description: string,
  logger: Logger,
): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.mode & 0o077) {
      logger.warn(
        `${description} ${filePath} is readable by group or other users; restrict it with chmod 600`,
      );
    }
  } catch {
    // A stat failure is not actionable here; the caller reports real IO errors.
  }
}
