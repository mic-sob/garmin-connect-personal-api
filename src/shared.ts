/** Shared public types. */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A calendar date formatted as `YYYY-MM-DD`. */
export type DateString = `${number}-${number}-${number}`;

export type QueryParam = string | number | boolean | readonly (string | number | boolean)[];

export type QueryParams = Record<string, QueryParam | undefined>;
