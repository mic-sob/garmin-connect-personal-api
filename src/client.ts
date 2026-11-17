/** Endpoint wrappers for the Garmin Personal API. */

import { BASE_URL_ENV_VAR, DEFAULT_BASE_URL, DEFAULT_TIMEOUT_SECONDS } from "./constants.js";
import { GarminPersonalApiError, HttpError } from "./errors.js";
import { createLogger, type Logger } from "./logger.js";
import type { DateString, JsonValue, QueryParams } from "./shared.js";
import type { components, paths } from "./types/garmin.js";

type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

export type GetJson<P extends keyof paths> = paths[P]["get"] extends { responses: { 200: infer R } }
  ? R extends { content: { "application/json": infer B } }
    ? B
    : unknown
  : unknown;

export interface GarminPersonalApiClientOptions {
  timeout?: number;
  fetch?: typeof fetch;
  logger?: Logger;
}

export interface SearchActivitiesOptions {
  start?: number;
  limit?: number;
  startDate?: DateString;
  endDate?: DateString;
  activityType?: string;
}

const ZIP_ACCEPT = "application/zip, application/x-zip-compressed, application/octet-stream";

/** Read Garmin data using an already-issued bearer token. */
export class GarminPersonalApiClient {
  readonly baseUrl: string;
  readonly timeout: number;

  private readonly fetchImpl: typeof fetch;
  private readonly logger: Logger;
  private headers: Record<string, string>;

  constructor(bearerToken: string, options: GarminPersonalApiClientOptions = {}) {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_SECONDS;
    if (timeout <= 0) {
      throw new GarminPersonalApiError("timeout must be greater than zero");
    }
    this.baseUrl = (process.env[BASE_URL_ENV_VAR] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = timeout;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.logger = options.logger ?? createLogger();
    this.headers = { Accept: "application/json" };
    this.updateBearerToken(bearerToken);
  }

  /** Replace the token used for subsequent requests. */
  updateBearerToken(bearerToken: string): void {
    this.headers = {
      Accept: "application/json",
      Authorization: `Bearer ${bearerToken}`,
    };
  }

  /** GET a known Personal API path and return its typed 200 response. */
  get<P extends keyof paths>(path: P, params?: QueryParams): Promise<GetJson<P> | null>;
  /** GET an arbitrary Personal API path and return decoded JSON, or null if empty. */
  get(path: string, params?: QueryParams): Promise<JsonValue>;
  async get(path: string, params?: QueryParams): Promise<JsonValue> {
    return (await this.rawGet(path, params)) as JsonValue;
  }

  async getDailyStress(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"MultiValueWellnessChartItemDTO">[]> {
    return this.requestList<Schema<"MultiValueWellnessChartItemDTO">>(
      `/usersummary-service/stats/stress/daily/${startDate}/${endDate}`,
    );
  }

  async getDailySteps(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"StepsDailyStatDTO">[]> {
    return this.requestList<Schema<"StepsDailyStatDTO">>(
      `/usersummary-service/stats/steps/daily/${startDate}/${endDate}`,
    );
  }

  async getDailyHydration(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"UserDailyHydrationDTO">[]> {
    return this.requestList<Schema<"UserDailyHydrationDTO">>(
      `/usersummary-service/stats/hydration/daily/${startDate}/${endDate}`,
    );
  }

  async getEffectiveWeightGoals(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"UserGoalsRangeDTO"> | null> {
    return this.requestJSON<Schema<"UserGoalsRangeDTO">>(
      `/goal-service/goal/user/effective/weightgoal/${startDate}/${endDate}`,
    );
  }

  async getWeightMeasurements(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"WeightRangeDTO"> | null> {
    return this.requestJSON<Schema<"WeightRangeDTO">>(
      `/weight-service/weight/range/${startDate}/${endDate}`,
      { includeAll: "true" },
    );
  }

  async getDailyFoodLogs(
    calendarDate: DateString,
  ): Promise<Schema<"DailyNutritionSummaryDTO"> | null> {
    return this.requestJSON<Schema<"DailyNutritionSummaryDTO">>(
      `/nutrition-service/food/logs/${calendarDate}`,
    );
  }

  async getUserProfileSettings(): Promise<Schema<"UserSettingsDTO"> | null> {
    return this.requestJSON<Schema<"UserSettingsDTO">>("/userprofile-service/userprofile/settings");
  }

  async getDailySleep(calendarDate: DateString): Promise<Schema<"DailySleepDTO"> | null> {
    return this.requestJSON<Schema<"DailySleepDTO">>("/sleep-service/sleep/dailySleep", {
      date: calendarDate,
    });
  }

  async getDailySleepSummaries(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"DailySleepDTO">[]> {
    return this.requestList<Schema<"DailySleepDTO">>(
      "/sleep-service/sleep/dailySleepSummariesByDate",
      { startDate, endDate },
    );
  }

  async getDailyBodyBattery(
    startDate: DateString,
    endDate: DateString,
    options: { chunks?: number } = {},
  ): Promise<Schema<"BodyBatteryDailyReportDTO">[]> {
    const params: QueryParams = { startDate, endDate };
    if (options.chunks !== undefined) {
      params.chunks = options.chunks;
    }
    return this.requestList<Schema<"BodyBatteryDailyReportDTO">>(
      "/wellness-service/wellness/bodyBattery/reports/daily",
      params,
    );
  }

  async getDailySummaries(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"ApiDocumentListUserDailySummaryV2DTO"> | null> {
    return this.requestJSON<Schema<"ApiDocumentListUserDailySummaryV2DTO">>(
      "/usersummary-service/v2/dailysummaries",
      { startDate, endDate },
    );
  }

  async getDailyHeartRate(calendarDate: DateString): Promise<Schema<"DailyHeartRateDTO"> | null> {
    return this.requestJSON<Schema<"DailyHeartRateDTO">>(
      "/wellness-service/wellness/dailyHeartRate",
      { date: calendarDate },
    );
  }

  async getDailyHrv(calendarDate: DateString): Promise<Schema<"HrvChartDTO"> | null> {
    return this.requestJSON<Schema<"HrvChartDTO">>(`/hrv-service/hrv/${calendarDate}`);
  }

  async getDailyHrvSummaries(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"HrvDailySummaryDTO"> | null> {
    return this.requestJSON<Schema<"HrvDailySummaryDTO">>(
      `/hrv-service/hrv/daily/${startDate}/${endDate}`,
    );
  }

  async getDailyVo2Max(
    startDate: DateString,
    endDate: DateString,
    options: { sport?: readonly string[] } = {},
  ): Promise<Schema<"MaxMetDTO">[]> {
    return this.requestList<Schema<"MaxMetDTO">>(
      `/metrics-service/metrics/maxmet/daily/${startDate}/${endDate}`,
      options.sport ? { sport: options.sport } : undefined,
    );
  }

  async getHeartRateZones(): Promise<Schema<"HeartRateZonesDTO">[]> {
    return this.requestList<Schema<"HeartRateZonesDTO">>("/biometric-service/heartRateZones/v2");
  }

  async getMenstrualCycleSummary(
    calendarDate: DateString,
  ): Promise<Schema<"MenstrualCycleSummaryDTO"> | null> {
    return this.requestJSON<Schema<"MenstrualCycleSummaryDTO">>(
      `/periodichealth-service/menstrualcycle/summary/${calendarDate}`,
    );
  }

  async getMenstrualCycleDayView(
    calendarDate: DateString,
    todayDate: DateString,
  ): Promise<Schema<"DetailedMenstrualCycleDayDTO"> | null> {
    return this.requestJSON<Schema<"DetailedMenstrualCycleDayDTO">>(
      `/periodichealth-service/menstrualcycle/dayview/${calendarDate}`,
      { todayDate },
    );
  }

  async getFitnessAge(calendarDate: DateString): Promise<Schema<"FitnessAgeDTO"> | null> {
    return this.requestJSON<Schema<"FitnessAgeDTO">>(
      `/fitnessage-service/fitnessage/v2/${calendarDate}`,
    );
  }

  async getDailySpo2(
    calendarDate: DateString,
  ): Promise<Schema<"DailySpO2AndAcclimationDTO"> | null> {
    return this.requestJSON<Schema<"DailySpO2AndAcclimationDTO">>(
      `/wellness-service/wellness/daily/spo2acclimation/${calendarDate}`,
    );
  }

  async getWellnessActivitySummaries(
    startDate: DateString,
    endDate: DateString,
  ): Promise<Schema<"WellnessActivitySummaryDTO">[]> {
    return this.requestList<Schema<"WellnessActivitySummaryDTO">>(
      `/wellnessactivity-service/activity/summary/range/${startDate}/${endDate}`,
    );
  }

  async getActivityTypes(): Promise<Schema<"SimpleActivityTypeDTO">[]> {
    return this.requestList<Schema<"SimpleActivityTypeDTO">>(
      "/activity-service/activity/activityTypes/simple",
    );
  }

  async searchActivities(
    options: SearchActivitiesOptions = {},
  ): Promise<Schema<"SummarizedActivityDTO">[]> {
    const params: QueryParams = {
      start: options.start ?? 0,
      limit: options.limit ?? 20,
    };
    if (options.startDate !== undefined) {
      params.startDate = options.startDate;
    }
    if (options.endDate !== undefined) {
      params.endDate = options.endDate;
    }
    if (options.activityType !== undefined) {
      params.activityType = options.activityType;
    }
    return this.requestList<Schema<"SummarizedActivityDTO">>(
      "/activitylist-service/activities/search/activities",
      params,
    );
  }

  async getActivity(activityId: number | string): Promise<Schema<"ActivitySummaryDTO"> | null> {
    return this.requestJSON<Schema<"ActivitySummaryDTO">>(
      `/activity-service/activity/${activityId}`,
    );
  }

  async getActivityWorkouts(activityId: number | string): Promise<Schema<"ActivityWorkoutDTO">[]> {
    return this.requestList<Schema<"ActivityWorkoutDTO">>(
      `/activity-service/activity/${activityId}/workouts`,
    );
  }

  /** Return the original activity file as ZIP bytes, without extracting it. */
  async downloadActivity(activityId: number | string): Promise<Uint8Array> {
    const id = String(activityId);
    if (!/^\d+$/.test(id) || Number(id) <= 0) {
      throw new GarminPersonalApiError("activity_id must be a positive integer");
    }
    const response = await this.getResponse(`/download-service/files/activity/${id}`, {
      accept: ZIP_ACCEPT,
    });
    const content = new Uint8Array(await response.arrayBuffer());
    if (content.length === 0) {
      throw new GarminPersonalApiError("The original activity file response was empty");
    }
    return content;
  }

  /** Return the single-day user summary for a calendar date. */
  async getDailySummary(calendarDate: DateString): Promise<Schema<"UserDailySummaryDto"> | null> {
    return this.requestJSON<Schema<"UserDailySummaryDto">>(
      "/usersummary-service/usersummary/daily",
      { calendarDate },
    );
  }

  private async requestJSON<T>(path: string, params?: QueryParams): Promise<T | null> {
    return (await this.rawGet(path, params)) as T | null;
  }

  private async requestList<T>(path: string, params?: QueryParams): Promise<T[]> {
    const value = await this.rawGet(path, params);
    return (value ?? []) as T[];
  }

  private async rawGet(path: string, params?: QueryParams): Promise<unknown> {
    const response = await this.getResponse(path, { params });
    const text = await response.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text) as unknown;
  }

  private async getResponse(
    path: string,
    options: { params?: QueryParams; accept?: string } = {},
  ): Promise<Response> {
    const query = encodeParams(options.params);
    const url = `${this.baseUrl}${path}`;
    const accept = options.accept ?? "application/json";
    this.logger.info(`GET ${path}${query}`);
    const response = await this.fetchImpl(url + query, {
      headers: { ...this.headers, Accept: accept },
      signal: AbortSignal.timeout(this.timeout * 1000),
    });
    if (!response.ok) {
      throw new HttpError({
        statusCode: response.status,
        method: "GET",
        url,
        responseText: await response.text(),
      });
    }
    return response;
  }
}

function encodeParams(params?: QueryParams): string {
  if (!params) {
    return "";
  }
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
