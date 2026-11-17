import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { DEFAULT_BASE_URL, GarminPersonalApiClient } from "../src/index.ts";
import { BASE_URL_ENV_VAR } from "../src/constants.ts";
import type { JsonValue, QueryParams } from "../src/shared.ts";

import {
  StubFetch,
  captureLogger,
  makeBytesResponse,
  makeEmptyResponse,
  makeResponse,
  qs,
} from "./helpers.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

const START = "2026-08-20";
const END = "2026-08-24";
const RANGE = { startDate: START, endDate: END };

describe("downloadActivity", () => {
  test("returns bytes and uses the zip accept header", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    const stub = new StubFetch(
      makeBytesResponse(bytes, { contentType: "application/x-zip-compressed" }),
    );
    const client = new GarminPersonalApiClient("token", { fetch: stub.fetch, timeout: 12 });

    await expect(client.downloadActivity(123)).resolves.toEqual(bytes);

    const call = stub.calls[0];
    expect(call.url).toBe(`${DEFAULT_BASE_URL}/download-service/files/activity/123`);
    expect(headers(call).get("Accept")).toBe(
      "application/zip, application/x-zip-compressed, application/octet-stream",
    );
    expect(headers(call).get("Authorization")).toBe("Bearer token");
  });

  test.each(["../file", "0", "-1", "abc", "１２３"])(
    "rejects invalid activity id %s",
    async (activityId) => {
      const client = new GarminPersonalApiClient("token", {
        fetch: new StubFetch().fetch,
      });
      await expect(client.downloadActivity(activityId)).rejects.toThrow(
        "activity_id must be a positive integer",
      );
    },
  );

  test.each([401, 404, 429, 500])("preserves http errors on status %i", async (status) => {
    const stub = new StubFetch(makeResponse({ error: "unavailable" }, status), {
      [`${DEFAULT_BASE_URL}/download-service/files/activity/123`]: makeResponse(
        { error: "unavailable" },
        status,
      ),
    });
    const client = new GarminPersonalApiClient("token", { fetch: stub.fetch });

    await expect(client.downloadActivity("123")).rejects.toMatchObject({ statusCode: status });
  });

  test("rejects an empty response", async () => {
    const stub = new StubFetch(makeEmptyResponse());
    const client = new GarminPersonalApiClient("token", { fetch: stub.fetch });

    await expect(client.downloadActivity(123)).rejects.toThrow(
      "The original activity file response was empty",
    );
  });
});

describe("endpoint wrappers", () => {
  type EndpointCase = {
    name: string;
    call: (client: GarminPersonalApiClient) => Promise<JsonValue>;
    path: string;
    params?: QueryParams;
  };

  const cases: EndpointCase[] = [
    {
      name: "stress",
      call: (c) => c.getDailyStress(START, END),
      path: `/usersummary-service/stats/stress/daily/${START}/${END}`,
    },
    {
      name: "steps",
      call: (c) => c.getDailySteps(START, END),
      path: `/usersummary-service/stats/steps/daily/${START}/${END}`,
    },
    {
      name: "hydration",
      call: (c) => c.getDailyHydration(START, END),
      path: `/usersummary-service/stats/hydration/daily/${START}/${END}`,
    },
    {
      name: "effective-weight-goals",
      call: (c) => c.getEffectiveWeightGoals(START, END),
      path: `/goal-service/goal/user/effective/weightgoal/${START}/${END}`,
    },
    {
      name: "weight-measurements",
      call: (c) => c.getWeightMeasurements(START, END),
      path: `/weight-service/weight/range/${START}/${END}`,
      params: { includeAll: "true" },
    },
    {
      name: "food-logs",
      call: (c) => c.getDailyFoodLogs(END),
      path: `/nutrition-service/food/logs/${END}`,
    },
    {
      name: "profile-settings",
      call: (c) => c.getUserProfileSettings(),
      path: "/userprofile-service/userprofile/settings",
    },
    {
      name: "sleep",
      call: (c) => c.getDailySleep(END),
      path: "/sleep-service/sleep/dailySleep",
      params: { date: END },
    },
    {
      name: "sleep-summaries",
      call: (c) => c.getDailySleepSummaries(START, END),
      path: "/sleep-service/sleep/dailySleepSummariesByDate",
      params: RANGE,
    },
    {
      name: "body-battery",
      call: (c) => c.getDailyBodyBattery(START, END),
      path: "/wellness-service/wellness/bodyBattery/reports/daily",
      params: RANGE,
    },
    {
      name: "body-battery-chunks",
      call: (c) => c.getDailyBodyBattery(START, END, { chunks: 2 }),
      path: "/wellness-service/wellness/bodyBattery/reports/daily",
      params: { ...RANGE, chunks: 2 },
    },
    {
      name: "daily-summaries",
      call: (c) => c.getDailySummaries(START, END),
      path: "/usersummary-service/v2/dailysummaries",
      params: RANGE,
    },
    {
      name: "heart-rate",
      call: (c) => c.getDailyHeartRate(END),
      path: "/wellness-service/wellness/dailyHeartRate",
      params: { date: END },
    },
    {
      name: "hrv",
      call: (c) => c.getDailyHrv(END),
      path: `/hrv-service/hrv/${END}`,
    },
    {
      name: "hrv-summaries",
      call: (c) => c.getDailyHrvSummaries(START, END),
      path: `/hrv-service/hrv/daily/${START}/${END}`,
    },
    {
      name: "vo2-max",
      call: (c) => c.getDailyVo2Max(START, END),
      path: `/metrics-service/metrics/maxmet/daily/${START}/${END}`,
    },
    {
      name: "vo2-max-sport-filter",
      call: (c) => c.getDailyVo2Max(START, END, { sport: ["RUNNING", "CYCLING"] }),
      path: `/metrics-service/metrics/maxmet/daily/${START}/${END}`,
      params: { sport: ["RUNNING", "CYCLING"] },
    },
    {
      name: "heart-rate-zones",
      call: (c) => c.getHeartRateZones(),
      path: "/biometric-service/heartRateZones/v2",
    },
    {
      name: "menstrual-cycle-summary",
      call: (c) => c.getMenstrualCycleSummary(END),
      path: `/periodichealth-service/menstrualcycle/summary/${END}`,
    },
    {
      name: "menstrual-cycle-day-view",
      call: (c) => c.getMenstrualCycleDayView(START, END),
      path: `/periodichealth-service/menstrualcycle/dayview/${START}`,
      params: { todayDate: END },
    },
    {
      name: "fitness-age",
      call: (c) => c.getFitnessAge(END),
      path: `/fitnessage-service/fitnessage/v2/${END}`,
    },
    {
      name: "spo2",
      call: (c) => c.getDailySpo2(END),
      path: `/wellness-service/wellness/daily/spo2acclimation/${END}`,
    },
    {
      name: "wellness-activity-summaries",
      call: (c) => c.getWellnessActivitySummaries(START, END),
      path: `/wellnessactivity-service/activity/summary/range/${START}/${END}`,
    },
    {
      name: "activity-types",
      call: (c) => c.getActivityTypes(),
      path: "/activity-service/activity/activityTypes/simple",
    },
    {
      name: "activities-defaults",
      call: (c) => c.searchActivities(),
      path: "/activitylist-service/activities/search/activities",
      params: { start: 0, limit: 20 },
    },
    {
      name: "activities-filters",
      call: (c) =>
        c.searchActivities({
          start: 5,
          limit: 10,
          startDate: START,
          endDate: END,
          activityType: "running",
        }),
      path: "/activitylist-service/activities/search/activities",
      params: { start: 5, limit: 10, ...RANGE, activityType: "running" },
    },
    {
      name: "activity",
      call: (c) => c.getActivity(123456789),
      path: "/activity-service/activity/123456789",
    },
    {
      name: "activity-workouts",
      call: (c) => c.getActivityWorkouts("123456789"),
      path: "/activity-service/activity/123456789/workouts",
    },
    {
      name: "daily-summary",
      call: (c) => c.getDailySummary(END),
      path: "/usersummary-service/usersummary/daily",
      params: { calendarDate: END },
    },
  ];

  test.each(cases)("$name sends the expected request", async ({ call, path, params }) => {
    const stub = new StubFetch(makeResponse({ ok: true }));
    const client = new GarminPersonalApiClient("token", { fetch: stub.fetch });

    await call(client);

    const request = stub.calls[0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe(`${DEFAULT_BASE_URL}${path}${params ? qs(params) : ""}`);
  });
});

describe("client", () => {
  test("log includes the path but never the bearer token", async () => {
    const stub = new StubFetch(makeResponse({}));
    const captured = captureLogger();
    const client = new GarminPersonalApiClient("secret-bearer-token", {
      fetch: stub.fetch,
      logger: captured.logger,
      timeout: 12,
    });

    await client.getDailySleep(END);

    expect(headers(stub.calls[0]).get("Authorization")).toBe("Bearer secret-bearer-token");
    expect(captured.messages.join("\n")).toContain(
      `GET /sleep-service/sleep/dailySleep?date=${END}`,
    );
    expect(captured.messages.join("\n")).not.toContain("secret-bearer-token");
  });

  test("sport filters are logged as repeated query parameters", async () => {
    const captured = captureLogger();
    const client = new GarminPersonalApiClient("token", {
      fetch: new StubFetch(makeResponse([])).fetch,
      logger: captured.logger,
    });

    await client.getDailyVo2Max(START, END, { sport: ["RUNNING", "CYCLING"] });

    expect(captured.messages.join("\n")).toContain(
      `GET /metrics-service/metrics/maxmet/daily/${START}/${END}?sport=RUNNING&sport=CYCLING`,
    );
  });

  test("updateBearerToken is used for subsequent requests", async () => {
    const stub = new StubFetch(makeResponse({}));
    const client = new GarminPersonalApiClient("old-token", { fetch: stub.fetch });

    client.updateBearerToken("new-token");
    await client.getUserProfileSettings();

    expect(headers(stub.calls[0]).get("Authorization")).toBe("Bearer new-token");
  });

  test("get supports endpoints without a wrapper", async () => {
    const stub = new StubFetch(makeResponse({ custom: true }));
    const client = new GarminPersonalApiClient("token", { fetch: stub.fetch });

    await expect(client.get("/custom-service/resource", { page: 2 })).resolves.toEqual({
      custom: true,
    });
    expect(stub.calls[0].url).toBe(`${DEFAULT_BASE_URL}/custom-service/resource?page=2`);
  });

  test("an empty response resolves to null", async () => {
    const client = new GarminPersonalApiClient("token", {
      fetch: new StubFetch(makeEmptyResponse()).fetch,
    });

    await expect(client.getDailyHrv(END)).resolves.toBeNull();
  });

  test.each([429, 500])(
    "http errors include status and response body (status %i)",
    async (status) => {
      const stub = new StubFetch(makeResponse({ message: "try later" }, status));
      const client = new GarminPersonalApiClient("token", { fetch: stub.fetch });

      await expect(client.getDailyHrv(END)).rejects.toMatchObject({
        statusCode: status,
        responseText: '{"message":"try later"}',
      });
    },
  );

  test("base url can be overridden by environment", () => {
    vi.stubEnv(BASE_URL_ENV_VAR, "https://example.test/");
    expect(new GarminPersonalApiClient("token").baseUrl).toBe("https://example.test");
  });
});

function headers(call: { init?: RequestInit }): Headers {
  return new Headers(call.init?.headers);
}
