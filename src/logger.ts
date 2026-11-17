/** Minimal injectable logger. */

export type LogLevel = "debug" | "info" | "warn" | "silent";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  silent: 3,
};

class StderrLogger implements Logger {
  private readonly order: number;

  constructor(level: LogLevel) {
    this.order = LEVEL_ORDER[level];
  }

  private log(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < this.order) {
      return;
    }
    console.error(message);
  }

  debug(message: string): void {
    this.log("debug", message);
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }
}

/**
 * Create a logger that writes to stderr.
 *
 * The default level is `warn`, matching Garmin's own client where request
 * activity is logged at INFO but hidden until logging is configured. Pass
 * `createLogger("info")` to see request logs.
 */
export function createLogger(level: LogLevel = "warn"): Logger {
  return new StderrLogger(level);
}
