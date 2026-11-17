/** Errors raised by the Garmin Personal API client. */

/** Base class for all package-specific errors. */
export class GarminPersonalApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GarminPersonalApiError";
  }
}

export interface HttpErrorOptions {
  statusCode: number;
  method: string;
  url: string;
  responseText: string;
}

/** Raised when the Garmin API returns an unsuccessful HTTP response. */
export class HttpError extends GarminPersonalApiError {
  readonly statusCode: number;
  readonly method: string;
  readonly url: string;
  readonly responseText: string;

  constructor({ statusCode, method, url, responseText }: HttpErrorOptions) {
    let message = `${method} ${url} returned HTTP ${statusCode}`;
    const stripped = responseText.trim();
    if (stripped) {
      message = `${message}: ${stripped}`;
    }
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.method = method;
    this.url = url;
    this.responseText = responseText;
  }
}
