# Configuration boundaries

WHISP-005 invariant: the API uses an explicitly named environment and explicit
credentials for enabled features; clients and operator diagnostics never receive
server credential values. Configuration belongs to its application workspace,
not `packages/contracts`.

## Settings

| Setting | Owner / visibility | Rule |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Mobile; public and bundled | Public API base URL for the intended environment. The example uses an invalid placeholder HTTPS domain. |
| `WHISP_ENV` | API only; non-secret | Required: exactly `development`, `preview` or `production`. No inferred or default environment. |
| `PORT` | Local API runner; non-secret | Defaults to `3000`; integer `1`–`65535`, loopback listener. |
| `ENABLE_DATABASE` | API only; non-secret | Exactly `true` or `false`; omitted means `false`. Empty and other values fail. |
| `MONGODB_URI` | API only; secret | Nonblank `mongodb://` or `mongodb+srv://` URI required when `ENABLE_DATABASE=true`. No default or fallback URI. |
| `ENABLE_SESSION_SIGNING` | API only; non-secret | Exactly `true` or `false`; omitted means `false`. Empty and other values fail. |
| `SESSION_SIGNING_SECRET` | API only; secret | Nonblank value required when `ENABLE_SESSION_SIGNING=true`. |
| `NODE_ENV` | Runtime / tooling; non-secret | Runtime optimization mode; never selects the API data environment. A preview may use `NODE_ENV=production`. |
| Future provider credentials and app-signing material | API host or release tooling only; secret | No provider is integrated or credential name selected yet. Never use a public mobile prefix, app config or shared contract export for these values. |

The database and session-signing flags currently gate configuration validation.
Their implementations belong to later tickets: enabling a flag does not add a
database connection, authentication or session issuance. MongoDB driver validation,
credential permissions and signing algorithm/key-strength rules belong to those
integrations; this change checks presence and the MongoDB scheme only. Disabled
features neither require nor retain their supplied credentials in `ApiConfig`.

## Environments and local setup

Copy `apps/api/.env.example` to `apps/api/.env`, then run
`npm run dev --prefix apps/api`. That command uses Node's optional env-file loader;
existing process environment values take precedence. Run the script through npm
so the working directory is `apps/api`. The placeholder example enables neither
database nor signing and runs health checks without external services. An empty
root `.env` does not configure either app.

Set `WHISP_ENV=preview` explicitly in the preview host and `WHISP_ENV=production`
explicitly in production. Hosting environment names and `NODE_ENV` are not used as
fallbacks. Supply separate database users, databases and signing credentials for
each environment; restrict preview/development users at the database to prevent
production writes. The parser cannot verify database permissions or detect a
production URI mislabeled as preview. Deployment isolation and live verification
remain WHISP-006/017 work. There is no production database URI in source or examples.

Copy `apps/mobile/.env.example` to `apps/mobile/.env` when setting up the mobile
build. Select the intended environment's public URL before building. The mobile
workspace is still a scaffold; the new `src/config.ts` uses Expo's static
`process.env.EXPO_PUBLIC_API_URL` expression for its future build. Expo substitutes
these public values into inspectable JavaScript. Never inline all of `process.env`
or import API configuration into mobile. Actual env files remain ignored; only
the two placeholder application examples are eligible for source control.

## Failure behavior

`apps/api/src/config.ts` owns the named rules. The Express app validates on its
first request, before health or unknown-route handling, and caches a successful
configuration for that app instance. Restart/redeploy after changing settings.
A missing environment, malformed flag or missing enabled-feature credential
returns HTTP `503` with exactly:

```json
{"error":"service_unavailable"}
```

The server logs a `configuration_error` event with fixed setting names and rule
identifiers, for example:

```json
{"event":"configuration_error","issues":[{"setting":"MONGODB_URI","rule":"required_when_database_enabled"}]}
```

Logs omit supplied values, request URLs, connection strings and stacks. The
custom error handler also returns a generic JSON `500` and a fixed
`internal_error` event for unexpected exceptions. Configuration errors are handled
inside Express so a bad deployment can answer with generic JSON instead of
exposing an initialization exception. With valid configuration, the existing
health response and JSON 404 contract are unchanged; health still does not test
database connectivity.

To reproduce the missing-secret path without storing any credential:

```sh
WHISP_ENV=preview ENABLE_DATABASE=true MONGODB_URI='' npm run dev --prefix apps/api
```

In another terminal, run `curl -i http://127.0.0.1:3000/api/health`; inspect the
generic response and the named rule in the server terminal.

## Validation and references

```sh
npm test --prefix apps/api
npm run typecheck --prefix apps/api
npm run check:mobile-config --prefix apps/api
```

The bundle check builds the actual mobile configuration module using esbuild,
with three fake server credentials seeded in the build process environment and
only the public API URL allowlisted for substitution. It searches the resulting
sample JavaScript, checks imports and contract sources, and includes a negative
control proving that a secret renamed `privateKey` remains visible. This is a
sample bundle, not an Expo/Metro build or native device result.

See [WHISP-005 validation and PR notes](validation/WHISP-005.md). The boundary
follows [React Native security guidance](https://reactnative.dev/docs/security)
and [Expo environment variable guidance](https://docs.expo.dev/guides/environment-variables/).
The final middleware follows [Express error handling](https://expressjs.com/en/guide/error-handling/).
