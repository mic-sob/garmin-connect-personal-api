// Live smoke check: exercise a few Personal API endpoints with a real key.
//
// Usage:
//   pnpm exec vpx examples/check.ts [YYYY-MM-DD]
//
// The API key is discovered the same way as in production: --api-key, the
// GARMIN_PERSONAL_API_KEY environment variable, or
// ~/.config/garmin/connect-personal-api-key.

import {
  GarminPersonalApiClient,
  PersonalApiAuthenticator,
  createLogger,
  resolveApiKey,
  type DateString,
} from "../src/index.ts";

function localToday(): DateString {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}` as DateString;
}

async function main(): Promise<void> {
  const date: DateString = (process.argv[2] as DateString | undefined) ?? localToday();

  const key = await resolveApiKey();
  const authenticator = new PersonalApiAuthenticator({ logger: createLogger("info") });
  const token = await authenticator.obtainToken(key);
  const client = new GarminPersonalApiClient(token.accessToken, {
    logger: createLogger("info"),
  });

  const checks: Array<[string, () => Promise<unknown>]> = [
    ["profile settings", () => client.getUserProfileSettings()],
    ["daily sleep", () => client.getDailySleep(date)],
    ["daily heart rate", () => client.getDailyHeartRate(date)],
    ["daily hrv", () => client.getDailyHrv(date)],
    ["daily steps", () => client.getDailySteps(date, date)],
    ["daily body battery", () => client.getDailyBodyBattery(date, date)],
    ["activity types", () => client.getActivityTypes()],
    ["search activities", () => client.searchActivities({ limit: 3 })],
  ];

  let failed = 0;
  for (const [name, call] of checks) {
    try {
      const result = await call();
      console.log(`\n== ${name} ==`);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      failed += 1;
      console.error(`\n== ${name} FAILED ==`);
      console.error(error instanceof Error ? error.message : error);
    }
  }

  console.log(`\n${checks.length - failed}/${checks.length} checks passed.`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
