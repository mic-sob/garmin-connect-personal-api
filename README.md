# @mic-sob/garmin-connect-personal-api

TypeScript client for the [Garmin Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-api/).

A loose port of Garmin's [`connect-personal-api-python`](https://github.com/garmin/connect-personal-api-python), rewritten in TypeScript with modern tooling and full types generated from Garmin's OpenAPI document.

- **Node.js >= 18**, ESM-only, zero runtime dependencies.
- Fully typed responses, generated from Garmin's OpenAPI 3.0.1 document
  (28 endpoints, 112 schemas), with corrections for places where the live API
  disagrees with the spec.
- Camel-case method names mirroring Garmin's Python client.

> **Not affiliated with Garmin.** "Garmin" and "Garmin Connect" are trademarks of
> Garmin Ltd. or its subsidiaries. Use of the API is subject to Garmin's terms.

## Install

```bash
npm install @mic-sob/garmin-connect-personal-api
```

## Authentication

Create a Personal API key on
[Garmin Connect](https://connect.garmin.com/app/settings/personalApiToken), then
exchange it for a bearer token:

```ts
import {
  PersonalApiAuthenticator,
  GarminPersonalApiClient,
  resolveApiKey,
} from "@mic-sob/garmin-connect-personal-api";

const authenticator = new PersonalApiAuthenticator();
const token = await authenticator.obtainToken(await resolveApiKey());

const client = new GarminPersonalApiClient(token.accessToken);
const sleep = await client.getDailySleep("2026-08-24");
const steps = await client.getDailySteps("2026-08-20", "2026-08-24");
```

### Key resolution

`resolveApiKey()` resolves the key in this order:

1. `apiKey` argument (`await resolveApiKey({ apiKey: "..." })`)
2. `keyFile` argument
3. `GARMIN_PERSONAL_API_KEY` environment variable
4. `~/.config/garmin/connect-personal-api-key`

An explicitly selected file that is missing, unreadable, or empty is an error,
never a fallback.

### Token cache

The authenticator caches the bearer token in
`~/.config/garmin/connect-personal-api-bearer-token.json` (mode `0600`, same path
and JSON shape as Garmin's own client). A cached token is reused until it is
within one hour of its JWT `exp` claim. Pass `{ forceRefresh: true }` to force a
new token:

```ts
const token = await authenticator.obtainToken(key, { forceRefresh: true });
```

Use a custom `TokenCache` to store tokens elsewhere (memory, a keyring, Redis…).

## Endpoint wrappers

`GarminPersonalApiClient` provides a convenience wrapper per Personal API data
set. Single-object methods return `Model | null`; list methods return `Model[]`.

| Method                                        | Endpoint                                                             |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `getDailyStress(start, end)`                  | `GET /usersummary-service/stats/stress/daily/{start}/{end}`          |
| `getDailySteps(start, end)`                   | `GET /usersummary-service/stats/steps/daily/{start}/{end}`           |
| `getDailyHydration(start, end)`               | `GET /usersummary-service/stats/hydration/daily/{start}/{end}`       |
| `getEffectiveWeightGoals(start, end)`         | `GET /goal-service/goal/user/effective/weightgoal/{start}/{end}`     |
| `getWeightMeasurements(start, end)`           | `GET /weight-service/weight/range/{start}/{end}`                     |
| `getDailyFoodLogs(date)`                      | `GET /nutrition-service/food/logs/{date}`                            |
| `getUserProfileSettings()`                    | `GET /userprofile-service/userprofile/settings`                      |
| `getDailySleep(date)`                         | `GET /sleep-service/sleep/dailySleep`                                |
| `getDailySleepSummaries(start, end)`          | `GET /sleep-service/sleep/dailySleepSummariesByDate`                 |
| `getDailyBodyBattery(start, end, { chunks })` | `GET /wellness-service/wellness/bodyBattery/reports/daily`           |
| `getDailySummary(date)`                       | `GET /usersummary-service/usersummary/daily`                         |
| `getDailySummaries(start, end)`               | `GET /usersummary-service/v2/dailysummaries`                         |
| `getDailyHeartRate(date)`                     | `GET /wellness-service/wellness/dailyHeartRate`                      |
| `getDailyHrv(date)`                           | `GET /hrv-service/hrv/{date}`                                        |
| `getDailyHrvSummaries(start, end)`            | `GET /hrv-service/hrv/daily/{start}/{end}`                           |
| `getDailyVo2Max(start, end, { sport })`       | `GET /metrics-service/metrics/maxmet/daily/{start}/{end}`            |
| `getHeartRateZones()`                         | `GET /biometric-service/heartRateZones/v2`                           |
| `getMenstrualCycleSummary(date)`              | `GET /periodichealth-service/menstrualcycle/summary/{date}`          |
| `getMenstrualCycleDayView(date, today)`       | `GET /periodichealth-service/menstrualcycle/dayview/{date}`          |
| `getFitnessAge(date)`                         | `GET /fitnessage-service/fitnessage/v2/{date}`                       |
| `getDailySpo2(date)`                          | `GET /wellness-service/wellness/daily/spo2acclimation/{date}`        |
| `getWellnessActivitySummaries(start, end)`    | `GET /wellnessactivity-service/activity/summary/range/{start}/{end}` |
| `searchActivities(options)`                   | `GET /activitylist-service/activities/search/activities`             |
| `getActivityTypes()`                          | `GET /activity-service/activity/activityTypes/simple`                |
| `getActivity(id)`                             | `GET /activity-service/activity/{id}`                                |
| `getActivityWorkouts(id)`                     | `GET /activity-service/activity/{id}/workouts`                       |
| `downloadActivity(id)`                        | `GET /download-service/files/activity/{id}` → `Uint8Array`           |

`weight/all` is intentionally not wrapped: it returns HTTP 400 for every input.

Dates are `YYYY-MM-DD` strings (the exported `DateString` type). Use `get()` for
an endpoint without a wrapper.

## Typed responses

The client exposes `get(path)` with an overload that returns the exact response
type for a known path:

```ts
import type { components, paths } from "@mic-sob/garmin-connect-personal-api";

type DailySleepDTO = components["schemas"]["DailySleepDTO"];
```

Every response field is typed (and, to mirror the live API, is nullable and
optional—Garmin omits and nulls fields freely).

## Errors

- `GarminPersonalApiError` — missing or empty credentials, invalid arguments,
  a token response without a JWT `exp` claim.
- `HttpError extends GarminPersonalApiError` — unsuccessful HTTP responses, with
  `statusCode`, `method`, `url`, and `responseText`.

## Configuration

- `fetch` — a custom `fetch` implementation (used by tests).
- `timeout` — seconds (default `30`).
- `logger` — an injectable `Logger`; the default writes warnings to stderr.
- `baseUrl` — overridden with `GARMIN_PERSONAL_API_BASE_URL`.

## Development

```bash
pnpm install
pnpm run check   # vp check: format, lint, type-check
pnpm test        # vp test: Vitest
pnpm run build   # vp pack: ESM + .d.ts
pnpm run generate:types  # regenerate src/types/garmin.ts from Garmin's spec
```

Types are generated by `scripts/fetch-openapi.mjs`, which extracts Garmin's
OpenAPI document from the Swagger page bundle, applies corrections, and feeds it
to `openapi-typescript`.

## License

Apache-2.0. Adapted from
[`garmin/connect-personal-api-python`](https://github.com/garmin/connect-personal-api-python),
Copyright 2026 Garmin Ltd. or its subsidiaries.
