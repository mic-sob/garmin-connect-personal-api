# Plan portu: Garmin Connect Personal API (TypeScript)

Luźny port biblioteki [`garmin/connect-personal-api-python`](https://github.com/garmin/connect-personal-api-python)
na TypeScript, gotowy do publikacji w npm.

## Cel

Klient Node.js (≥18) dający typowany dostęp do Garmin Connect Personal API.
Pełne typowanie wygenerowane z OpenAPI 3.0.1 Garmina, bez walidacji w runtime.
Nazwy metod w `camelCase`.

## Decyzje (ustalone)

| Temat         | Decyzja                                                 |
| ------------- | ------------------------------------------------------- |
| Nazwa pakietu | `@mic-sob/garmin-connect-personal-api`                  |
| Platforma     | Node ≥18 (bez przeglądarki na razie)                    |
| HTTP          | globalny `fetch`; wstrzykiwalny dla testów              |
| Styl metod    | `camelCase` (patrz tabela odwzorowań w README)          |
| Typowanie     | pełne, z OpenAPI; bez walidacji runtime (bez zod)       |
| Nazwy typów   | verbatim ze speca (z sufiksem `DTO`)                    |
| Licencja      | Apache-2.0 + atrybucja Garmin                           |
| Zakres v1     | rdzeń: auth + client + błędy. Bez CLI, bez przeglądarki |

## Źródło typów

- Spec: OpenAPI 3.0.1 osadzony w bundlu JS strony Swagger:
  https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
- Zawartość: **28 endpointów GET, 112 schematów**, wersja `1.0.0`.
- Endpoint wymiany tokena (`POST /personalapitoken-service/...` ) **nie jest** w specu —
  obsługiwany osobno, jak w kliencie Garmina.

### Ekstrakcja i generacja

1. `scripts/fetch-openapi.mjs` pobiera stronę, wyciąga URL bundla JS, znajduje
   `JSON.parse('{"openapi"')`, dekoduje literał JS, stosuje poprawki, zapisuje
   `openapi.patched.json`.
2. `openapi-typescript openapi.patched.json -o src/types/garmin.d.ts`.
3. Commitujemy tylko wygenerowany `garmin.d.ts`; surowego `openapi.json` nie
   (to treść Garmina). Skrypt generujący commitujemy.

### Poprawki (zweryfikowane na live API, październik 2026)

Przeniesione z [`gcpapi-sync`](https://github.com/thomascamminady/gcpapi-sync-python):

- Schematy-skalary: `ConnectDate`, `ConnectTimestamp`, `LocalTime` wracają jako string,
  nie obiekt.
- `lastUpdated` w `FitnessAgeDTO` to `date-time`, nie timestamp.
- Kilka pól `date-time` wraca jako milisekundy od epoki (np. sen, waga).
- Mapy o stałych kluczach stają się typowane: `StressValues`, `FitnessAgeComponents`,
  `SleepScores`.
- Dodane pola nieudokumentowane (`EXTRA_FIELDS`): Body Battery events, sleep `retro`,
  weight `samplePk`/`sourceType`, `GarminUUID.uuid`, hydration, `userPro`.
- Pola deklarowane jako non-null w praktyce są `null` — typujemy permissywnie.
- `fitnessage` zwraca obiekt, a nie tablicę.
- Seria intraday to tablica liczb, nie obiektów — typowane akcesory.
- Pobranie aktywności wymaga `Accept: application/x-zip-compressed`.
- `GET /weight-service/weight/all/...` zwraca zawsze 400 (zepsute) — pomijamy wrapper.
- Limity zakresów: daily summaries ~31-90 dni; search ~45/strone.

## Architektura (moduły)

| Plik                    | Zawartość                                                              | Wzorzec w Pythonie |
| ----------------------- | ---------------------------------------------------------------------- | ------------------ |
| `src/constants.ts`      | base URL, `TOKEN_PATH`, env-y, timeout, ścieżki                        | `constants.py`     |
| `src/errors.ts`         | `GarminPersonalApiError`, `HttpError`                                  | `errors.py`        |
| `src/types/garmin.d.ts` | typy OpenAPI (generowane)                                              | —                  |
| `src/client.ts`         | `GarminPersonalApiClient`, 26 wrapperów, `get`, `downloadActivity`     | `client.py`        |
| `src/auth.ts`           | `BearerToken`, `PersonalApiAuthenticator`, `FileTokenCache`, JWT `exp` | `auth.py`          |
| `src/apiKeys.ts`        | `resolveApiKey` (klucz arg → plik → env → domyślny plik)               | `api_keys.py`      |
| `src/credentials.ts`    | walidacja klucza, ostrzeżenie `chmod 600`                              | `_credentials.py`  |
| `src/index.ts`          | eksport publiczny                                                      | `__init__.py`      |

## Transport

- `fetch` globalny. Klient i authenticator przyjmują opcjonalny `fetch` (odpowiednik
  `requests.Session`) — testy używają dubla (`StubFetch`), bez sieci.
- Cache tokena: `FileTokenCache` domyślnie (fs, `0600`, fingerprint `base_url\0key`),
  odświeżanie gdy do `exp` < 1h. Interfejs `TokenCache` pozwala podmienić.

## Testy

- Vitest (wbudowany w Vite+), duble `fetch` lustrzane do `StubSession` z Pythona.
- Pokrycie: każdy wrapper wysyła właściwy `GET` + params; błędy HTTP niosą
  `statusCode/method/url/responseText`; cache tokena; `resolveApiKey`; walidacja
  `activityId`; środowiskowy `base_url`.

## Tooling (Vite+)

- `pnpm exec vp pack` — build biblioteki (tsdown, ESM + DTS).
- `pnpm exec vp check` — oxlint + oxfmt + tsgo.
- `pnpm exec vp test` — Vitest.
- `vp toolchain` pokazuje wersje zależne od `vite-plus`.

## Poza zakresem v1

- CLI (`gc-personal`).
- Przeglądarka (CORS blokuje bezpośrednie wywołania; wymagałby proxy/BFF).
- Walidacja runtime (zod); retry/backoff; stronicowanie zakresów.
