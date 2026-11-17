import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { PersonalApiAuthenticator, FileTokenCache, TOKEN_PATH } from "../src/index.ts";
import { BASE_URL_ENV_VAR } from "../src/constants.ts";

import { StubFetch, makeJwt, makeTempDir, makeTextResponse } from "./helpers.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

const NOW = 1_800_000_000;
const HOUR = 60 * 60;
const TOKEN_URL = `https://personal.connectapi.garmin.com${TOKEN_PATH}`;

async function authenticator(options: { timeout?: number; cacheFile?: string } = {}): Promise<{
  auth: PersonalApiAuthenticator;
  stub: StubFetch;
  cacheFile: string;
}> {
  const cacheFile = options.cacheFile ?? path.join(await makeTempDir(), "bearer-token-cache.json");
  const stub = new StubFetch();
  const auth = new PersonalApiAuthenticator({
    fetch: stub.fetch,
    timeout: options.timeout ?? 30,
    tokenCache: new FileTokenCache({ filePath: cacheFile }),
    clock: () => NOW,
  });
  return { auth, stub, cacheFile };
}

function tokenResponse(accessToken: string, status = 200): Response {
  return makeTextResponse(accessToken, status);
}

describe("obtainToken", () => {
  test("exchanges the key for a JWT and parses its expiration", async () => {
    const accessToken = makeJwt({ exp: NOW + 2 * HOUR });
    const { auth, stub } = await authenticator({ timeout: 12 });
    stub.responses.set(TOKEN_URL, tokenResponse(`${accessToken}\n`));

    await expect(auth.obtainToken(" secret-key ")).resolves.toEqual({
      accessToken,
      expiresAt: NOW + 2 * HOUR,
    });

    expect(stub.calls[0].method).toBe("POST");
    expect(stub.calls[0].url).toBe(TOKEN_URL);
    expect(new Headers(stub.calls[0].init?.headers).get("Authorization")).toBe("ApiKey secret-key");
    expect(new Headers(stub.calls[0].init?.headers).get("Accept")).toBe("*/*");
  });

  test("rejects a missing key without discovering one", async () => {
    const { auth, stub } = await authenticator();

    await expect(auth.obtainToken(null as unknown as string)).rejects.toThrow("resolveApiKey");

    expect(stub.calls).toHaveLength(0);
  });

  test("rejects an empty key", async () => {
    const { auth } = await authenticator();
    await expect(auth.obtainToken("  ")).rejects.toThrow(
      "The value from the explicit API key is empty.",
    );
  });

  test.each(["opaque-token", makeJwt({ sub: "user" })])(
    "rejects a token without a JWT exp claim",
    async (accessToken) => {
      const { auth, stub } = await authenticator();
      stub.responses.set(TOKEN_URL, tokenResponse(accessToken));

      await expect(auth.obtainToken("key")).rejects.toThrow(
        "The token endpoint did not return a JWT with an exp claim.",
      );
    },
  );

  test("preserves token endpoint error bodies", async () => {
    const { auth, stub } = await authenticator();
    stub.responses.set(TOKEN_URL, tokenResponse('{"message": "invalid credentials"}', 401));

    await expect(auth.obtainToken("api-key")).rejects.toMatchObject({
      statusCode: 401,
      responseText: '{"message": "invalid credentials"}',
    });
  });
});

describe("bearer token cache", () => {
  test("stores the token but not the API key", async () => {
    const apiKey = "do-not-store-this-key";
    const accessToken = makeJwt({ exp: NOW + 2 * HOUR });
    const { auth, stub, cacheFile } = await authenticator();
    stub.responses.set(TOKEN_URL, tokenResponse(accessToken));

    await auth.obtainToken(apiKey);

    const serialized = await readFile(cacheFile, "utf8");
    expect(serialized).toContain(accessToken);
    expect(serialized).not.toContain(apiKey);
    expect(JSON.parse(serialized)).toEqual({
      fingerprint: expect.any(String),
      access_token: accessToken,
      expires_at: NOW + 2 * HOUR,
    });
  });

  test.each([
    { lifetime: 2 * HOUR, force: false, expectRequest: false },
    { lifetime: HOUR, force: false, expectRequest: true },
    { lifetime: -HOUR, force: false, expectRequest: true },
    { lifetime: 2 * HOUR, force: true, expectRequest: true },
  ] as const)(
    "reuses the cache until the refresh window (lifetime $lifetime, force $force)",
    async ({ lifetime, force, expectRequest }) => {
      const cachedToken = makeJwt({ exp: NOW + lifetime });
      const newToken = makeJwt({ exp: NOW + 24 * HOUR });

      const dir = await makeTempDir();
      const cacheFile = path.join(dir, "cache.json");

      const first = await authenticator({ cacheFile });
      first.stub.responses.set(TOKEN_URL, tokenResponse(cachedToken));
      await first.auth.obtainToken("key");

      const second = await authenticator({ cacheFile });
      second.stub.responses.set(TOKEN_URL, tokenResponse(newToken));
      const token = await second.auth.obtainToken("key", { forceRefresh: force });

      expect(token.accessToken).toBe(expectRequest ? newToken : cachedToken);
      expect(second.stub.calls).toHaveLength(expectRequest ? 1 : 0);
    },
  );

  test("binds the cache to the API key", async () => {
    const firstToken = makeJwt({ exp: NOW + 2 * HOUR });
    const secondToken = makeJwt({ exp: NOW + 3 * HOUR });

    const dir = await makeTempDir();
    const cacheFile = path.join(dir, "cache.json");

    const first = await authenticator({ cacheFile });
    first.stub.responses.set(TOKEN_URL, tokenResponse(firstToken));
    await first.auth.obtainToken("key");

    const second = await authenticator({ cacheFile });
    second.stub.responses.set(TOKEN_URL, tokenResponse(secondToken));
    const token = await second.auth.obtainToken("other-key");

    expect(token.accessToken).toBe(secondToken);
    expect(second.stub.calls).toHaveLength(1);
  });

  test("binds the cache to the base URL", async () => {
    const firstToken = makeJwt({ exp: NOW + 2 * HOUR });
    const secondToken = makeJwt({ exp: NOW + 3 * HOUR });

    const dir = await makeTempDir();
    const cacheFile = path.join(dir, "cache.json");

    vi.stubEnv(BASE_URL_ENV_VAR, "https://one.example");
    const first = await authenticator({ cacheFile });
    first.stub.responses.set(`https://one.example${TOKEN_PATH}`, tokenResponse(firstToken));
    await first.auth.obtainToken("key");

    vi.stubEnv(BASE_URL_ENV_VAR, "https://two.example");
    const second = await authenticator({ cacheFile });
    second.stub.responses.set(`https://two.example${TOKEN_PATH}`, tokenResponse(secondToken));
    const token = await second.auth.obtainToken("key");

    expect(token.accessToken).toBe(secondToken);
    expect(second.stub.calls).toHaveLength(1);
  });

  test("replaces an invalid cache file", async () => {
    const accessToken = makeJwt({ exp: NOW + 2 * HOUR });
    const { auth, stub, cacheFile } = await authenticator();
    stub.responses.set(TOKEN_URL, tokenResponse(accessToken));

    await writeFile(cacheFile, "not json", "utf8");

    const token = await auth.obtainToken("key");
    expect(token.accessToken).toBe(accessToken);
  });
});
