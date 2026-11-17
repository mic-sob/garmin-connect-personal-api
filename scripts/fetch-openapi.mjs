// Fetch Garmin's Personal API OpenAPI document and apply corrections for places
// where the live API contradicts the spec.
//
// Garmin publishes the spec only inside the JavaScript bundle of its Swagger page,
// so this locates that bundle, extracts the embedded JSON, applies the corrections
// below (verified against live responses, October 2026), and writes the patched
// spec to `openapi.patched.json`.
//
// Usage:
//   node scripts/fetch-openapi.mjs
import { writeFile } from "node:fs/promises";

const SWAGGER_PAGE = "https://developer.garmin.com/gc-developer-program/personal/swagger-docs/";
const BUNDLE_RE =
  /src="(\/component---src-pages-gc-developer-program-personal-swagger-docs-js-[^"]+\.js)"/;
const OUTPUT = "openapi.patched.json";

// ---------------------------------------------------------------------------
// Corrections (ported from gcpapi-sync's generate_models.py, Apache/MIT).
// ---------------------------------------------------------------------------

function seconds(description) {
  return { type: "number", format: "double", description };
}

function fitnessComponent(description) {
  return { $ref: "#/components/schemas/FitnessAgeComponent", description };
}

function sleepScoreItem(description) {
  return { $ref: "#/components/schemas/SleepScoreItem", description };
}

// Free-form maps in the spec whose keys are in fact fixed. They become typed
// objects so every value is reachable as a typed field.
const NEW_SCHEMAS = {
  StressValues: {
    type: "object",
    description: "Stress metrics for one day. Durations are in seconds.",
    properties: {
      overallStressLevel: {
        type: "number",
        format: "double",
        description: "Average stress level (0-100); negative when not enough data.",
      },
      restStressDuration: seconds("Time at rest (stress 0-25), in seconds."),
      lowStressDuration: seconds("Time with low stress (26-50), in seconds."),
      mediumStressDuration: seconds("Time with medium stress (51-75), in seconds."),
      highStressDuration: seconds("Time with high stress (76-100), in seconds."),
    },
  },
  FitnessAgeComponents: {
    type: "object",
    description: "The inputs that determine Fitness Age.",
    properties: {
      vigorousDaysAvg: fitnessComponent("Average vigorous-activity days per week."),
      vigorousMinutesAvg: fitnessComponent("Average vigorous intensity minutes per week."),
      rhr: fitnessComponent("Resting heart rate."),
      bodyFat: fitnessComponent("Body fat percentage."),
      bmi: fitnessComponent("Body mass index (used when body fat is unavailable)."),
    },
  },
  SleepScores: {
    type: "object",
    description: "The overall sleep score and its contributing factors.",
    properties: {
      overall: sleepScoreItem("Overall sleep score."),
      totalDuration: sleepScoreItem("Total sleep duration."),
      stress: sleepScoreItem("Average stress during sleep."),
      awakeCount: sleepScoreItem("Number of awakenings."),
      restlessness: sleepScoreItem("Restlessness."),
      remPercentage: sleepScoreItem("Share of REM sleep."),
      lightPercentage: sleepScoreItem("Share of light sleep."),
      deepPercentage: sleepScoreItem("Share of deep sleep."),
    },
  },
};

// Fields the live API returns that the spec does not document.
const EXTRA_FIELDS = {
  BodyBatteryActivityEventDTO: {
    activityId: {
      type: "integer",
      format: "int64",
      description: "ID of the activity behind this event, if any.",
    },
    activityName: {
      type: "string",
      description: "Name of the activity behind this event, if any.",
    },
    activityType: { type: "string", description: "Activity type key, such as `running`." },
    deviceId: {
      type: "integer",
      format: "int64",
      description: "ID of the device that recorded the event.",
    },
    eventUpdateTimeGmt: {
      type: "string",
      format: "date-time",
      description: "When the event was last updated, in UTC.",
    },
  },
  DailySleepDTO: {
    retro: { type: "boolean", description: "Whether the sleep record was entered retroactively." },
  },
  DateWeightDTO: {
    samplePk: {
      type: "integer",
      format: "int64",
      description: "Primary key of the weight sample.",
    },
    sourceType: {
      type: "string",
      description: "Source of the measurement, such as `INDEX_SCALE` or `MANUAL`.",
    },
  },
  GarminUUID: {
    uuid: { type: "string", format: "uuid", description: "The UUID in canonical string form." },
  },
  HydrationV2DTO: {
    consumedInMl: {
      type: "number",
      format: "double",
      description: "Hydration consumed, in milliliters.",
    },
  },
  UserInfoDto: {
    userPro: { type: "boolean", description: "Whether the user has a pro account." },
  },
};

// Property schema replacements: [schema, field] -> new property schema.
const FIELD_SCHEMAS = {
  "MultiValueWellnessChartItemDTO|values": { $ref: "#/components/schemas/StressValues" },
  "FitnessAgeDTO|components": { $ref: "#/components/schemas/FitnessAgeComponents" },
  "DailySleepDTO|sleepScores": { $ref: "#/components/schemas/SleepScores" },
  "FitnessAgeDTO|lastUpdated": { type: "string", format: "date-time" },
};

// Schemas the API serializes as plain strings, not the objects the spec describes.
const SCALAR_SCHEMAS = new Set(["ConnectDate", "ConnectTimestamp", "LocalTime"]);

// Path response overrides: [path] -> new 200 response schema.
const RESPONSE_SCHEMAS = {
  "/fitnessage-service/fitnessage/v2/{calendarDate}": {
    $ref: "#/components/schemas/FitnessAgeDTO",
  },
};

function warn(message) {
  console.warn(`warning: ${message}`);
}

function patchSpec(spec) {
  const schemas = spec.components.schemas;

  for (const [name, schema] of Object.entries(NEW_SCHEMAS)) {
    if (name in schemas) warn(`the spec now defines ${name}; review NEW_SCHEMAS`);
    schemas[name] ??= schema;
  }

  for (const [schemaName, fields] of Object.entries(EXTRA_FIELDS)) {
    if (!(schemaName in schemas)) {
      warn(`${schemaName} is gone from the spec; drop it from EXTRA_FIELDS`);
      continue;
    }
    const properties = (schemas[schemaName].properties ??= {});
    for (const [fieldName, fieldSchema] of Object.entries(fields)) {
      if (fieldName in properties)
        warn(`${schemaName}.${fieldName} is now in the spec; drop it from EXTRA_FIELDS`);
      properties[fieldName] ??= fieldSchema;
    }
  }

  for (const [key, replacement] of Object.entries(FIELD_SCHEMAS)) {
    const [schemaName, fieldName] = key.split("|");
    const properties = schemas[schemaName]?.properties;
    if (!properties || !(fieldName in properties)) {
      warn(`${schemaName}.${fieldName} is gone from the spec; drop it from FIELD_SCHEMAS`);
      continue;
    }
    const original = properties[fieldName];
    properties[fieldName] = { description: original?.description ?? "", ...replacement };
  }

  for (const name of SCALAR_SCHEMAS) {
    const original = schemas[name];
    if (!original) {
      warn(`${name} is gone from the spec; drop it from SCALAR_SCHEMAS`);
      continue;
    }
    const scalar =
      name === "ConnectTimestamp"
        ? { type: "string", format: "date-time", description: original.description ?? "" }
        : { type: "string", description: original.description ?? "" };
    schemas[name] = scalar;
  }

  for (const [path, schema] of Object.entries(RESPONSE_SCHEMAS)) {
    const response = spec.paths[path]?.get?.responses?.["200"];
    const original = response?.content?.["application/json"]?.schema;
    if (!original) {
      warn(`${path} 200 response is gone from the spec; drop it from RESPONSE_SCHEMAS`);
      continue;
    }
    response.content["application/json"].schema = { description: original.description, ...schema };
  }

  return spec;
}

function normalizeNullability(schemas) {
  // Garmin omits and nulls fields freely, so treat every property as optional
  // and nullable. openapi-typescript turns a non-required nullable property into
  // `field?: T | null`.
  for (const schema of Object.values(schemas)) {
    if (schema && typeof schema === "object" && schema.properties) {
      delete schema.required;
      for (const property of Object.values(schema.properties)) {
        if (property && typeof property === "object" && !("nullable" in property)) {
          property.nullable = true;
        }
      }
    }
  }
}

function decodeJsString(source, start) {
  const simple = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0", "'": "'" };
  const out = [];
  let i = start;
  for (;;) {
    const char = source[i];
    if (char === "\\") {
      const next = source[i + 1];
      if (next === "u") {
        out.push(String.fromCodePoint(Number.parseInt(source.slice(i + 2, i + 6), 16)));
        i += 6;
      } else if (next === "x") {
        out.push(String.fromCodePoint(Number.parseInt(source.slice(i + 2, i + 4), 16)));
        i += 4;
      } else {
        out.push(simple[next] ?? next);
        i += 2;
      }
      continue;
    }
    if (char === "'") return out.join("");
    out.push(char);
    i += 1;
  }
}

async function fetchSpec() {
  const page = await (await fetch(SWAGGER_PAGE)).text();
  const match = BUNDLE_RE.exec(page);
  if (!match) {
    throw new Error("Could not find the Swagger bundle on Garmin's page; the site layout changed.");
  }
  const bundle = await (await fetch(`https://developer.garmin.com${match[1]}`)).text();
  const marker = `JSON.parse('{"openapi"`;
  const index = bundle.indexOf(marker);
  if (index < 0) {
    throw new Error("Could not find the embedded OpenAPI document in the Swagger bundle.");
  }
  const start = index + "JSON.parse('".length;
  return JSON.parse(decodeJsString(bundle, start));
}

const spec = patchSpec(await fetchSpec());
normalizeNullability(spec.components.schemas);
await writeFile(OUTPUT, `${JSON.stringify(spec, null, 2)}\n`);
const pathCount = Object.keys(spec.paths).length;
const schemaCount = Object.keys(spec.components.schemas).length;
console.log(`wrote ${OUTPUT}: ${pathCount} paths, ${schemaCount} schemas`);
