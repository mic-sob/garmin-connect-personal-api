import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { GarminPersonalApiError, resolveApiKey } from "../src/index.ts";

import { makeTempDir } from "./helpers.ts";

async function tmpKeyFile(content: string): Promise<string> {
  const dir = await makeTempDir();
  const filePath = path.join(dir, "key");
  await writeFile(filePath, content, "utf8");
  return filePath;
}

describe("resolveApiKey", () => {
  test("resolves explicit key, then explicit file, env, then default file", async () => {
    const defaultFile = await tmpKeyFile("default-key\n");
    const keyFile = await tmpKeyFile("file-key\n");
    const env = { GARMIN_PERSONAL_API_KEY: " env-key " };

    expect(await resolveApiKey({ apiKey: " explicit-key ", env, keyFile })).toBe("explicit-key");
    expect(await resolveApiKey({ env, keyFile })).toBe("file-key");
    expect(await resolveApiKey({ env: {}, defaultKeyFile: defaultFile })).toBe("default-key");
    expect(await resolveApiKey({ env })).toBe("env-key");
    expect(await resolveApiKey({ env: {}, keyFile })).toBe("file-key");
  });

  test("an explicit key file overrides the environment", async () => {
    const keyFile = await tmpKeyFile(" file-key\n");
    expect(await resolveApiKey({ keyFile, env: { GARMIN_PERSONAL_API_KEY: "env-key" } })).toBe(
      "file-key",
    );
  });

  test.each([{}, { GARMIN_PERSONAL_API_KEY: "  " }])(
    "rejects an empty file or environment key",
    async (env) => {
      const keyFile = await tmpKeyFile(" \n");
      await expect(resolveApiKey({ env, keyFile })).rejects.toThrow("empty");
    },
  );

  test("an empty environment key does not fall back to the default file", async () => {
    const defaultFile = await tmpKeyFile("file-key");
    await expect(
      resolveApiKey({ env: { GARMIN_PERSONAL_API_KEY: "" }, defaultKeyFile: defaultFile }),
    ).rejects.toThrow("environment variable GARMIN_PERSONAL_API_KEY");
  });

  test("a missing key produces a help message naming the default file", async () => {
    const dir = await makeTempDir();
    await expect(
      resolveApiKey({ env: {}, defaultKeyFile: path.join(dir, "missing") }),
    ).rejects.toThrow("No personal API key was provided");
  });

  test("a missing explicit file is an error, not a fallback", async () => {
    const dir = await makeTempDir();
    await expect(
      resolveApiKey({
        env: { GARMIN_PERSONAL_API_KEY: "env-key" },
        keyFile: path.join(dir, "missing"),
      }),
    ).rejects.toThrow("does not exist");
  });

  test("an explicit key overrides an invalid file and environment", async () => {
    const dir = await makeTempDir();
    expect(
      await resolveApiKey({
        apiKey: "explicit-key",
        env: { GARMIN_PERSONAL_API_KEY: "" },
        keyFile: path.join(dir, "missing"),
      }),
    ).toBe("explicit-key");
  });

  test("an empty explicit key does not fall back", async () => {
    const keyFile = await tmpKeyFile("file-key");
    await expect(
      resolveApiKey({
        apiKey: " ",
        env: { GARMIN_PERSONAL_API_KEY: "env-key" },
        keyFile,
      }),
    ).rejects.toThrow("explicit API key");
  });

  test("an explicit directory is surfaced as an error", async () => {
    const dir = await makeTempDir();
    const keyFile = path.join(dir, "key-dir");
    await mkdir(keyFile);

    await expect(
      resolveApiKey({ env: { GARMIN_PERSONAL_API_KEY: "env-key" }, keyFile }),
    ).rejects.toBeInstanceOf(Error);
  });

  test("an explicit key is validated by GarminPersonalApiError", async () => {
    await expect(resolveApiKey({ apiKey: "  " })).rejects.toBeInstanceOf(GarminPersonalApiError);
  });
});
