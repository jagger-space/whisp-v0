# WHISP-005: configuration failures without secret disclosure

Date: 25 October 2026  
Environment: macOS, Node.js 26.8.1, npm 11.19.0  
Scope: local API, configuration rules and sample mobile JavaScript bundle.

## Change and invariant

The API requires an explicit `WHISP_ENV` and validates required values for enabled
database/signing features on first request. There is no inferred production
environment or fallback database URI. Configuration errors contain fixed setting
names and rule identifiers; clients receive a generic JSON error. Server
credentials belong only in API/deployment configuration. The shared contracts
remain unchanged by this ticket.

The [configuration document](../configuration.md) is the single settings table.
The two workspace `.env.example` files use placeholders and disabled feature
flags; `.gitignore` allows those examples while ignoring actual environment files.
The API development command optionally loads its workspace `.env`.

## Reproduce

From the repository root:

```sh
npm ci --prefix apps/api
npm test --prefix apps/api
npm run typecheck --prefix apps/api
npm run check:mobile-config --prefix apps/api
npm test --prefix packages/contracts
npm run typecheck --prefix packages/contracts
```

For the local missing-secret demonstration:

```sh
WHISP_ENV=preview ENABLE_DATABASE=true ENABLE_SESSION_SIGNING=true MONGODB_URI='' SESSION_SIGNING_SECRET='' npm run dev --prefix apps/api
```

In another terminal:

```sh
curl -i http://127.0.0.1:3000/api/health
```

To run successfully, copy the API example to `apps/api/.env` and use
`npm run dev --prefix apps/api`, or set `WHISP_ENV=development` with both flags
false in the process environment. Tests pass explicit environment objects so
their results do not depend on a developer's local credentials.

## Recorded evidence

```text
API: tests 29; pass 29; fail 0
Shared contracts: tests 44; pass 44; fail 0
PASS API TypeScript check
PASS shared contracts TypeScript check
PASS package and lockfile devDependencies agree
PASS git diff --check
```

Initial sandbox attempts denied loopback listeners and the existing contracts
runner's IPC socket with `EPERM`. Both suites passed after running outside the
sandbox. The HTTP tests exercise actual requests on ephemeral loopback ports,
including valid environments, missing settings, invalid secret-bearing values,
the generic unexpected-error path and the existing health/404 contract.

A separate smoke check launched the real `src/local.ts` entry point with Node's
optional workspace env-file loader, passed explicit process environment settings,
requested health over loopback and captured the server's stderr. It observed:

```text
valid development: HTTP 200 {"status":"ok","service":"whisp-api","contractVersion":1}
missing enabled-feature secrets: HTTP 503 {"error":"service_unavailable"}
operator log: {"event":"configuration_error","issues":[{"setting":"MONGODB_URI","rule":"required_when_database_enabled"},{"setting":"SESSION_SIGNING_SECRET","rule":"required_when_session_signing_enabled"}]}
PASS actual local entry point with explicit process environment
```

The first smoke harness expected empty stderr on success; Node also emits
`.env not found. Continuing without it.` when the optional file is absent. The
corrected harness accepted that fixed notice and checked the application log
entries independently. Both smoke cases then passed, and their processes were
terminated. No credential files were created.

Tests also seed disposable values into an invalid environment name, a malformed
URI containing a fake password, signing/provider values, a request query and an
unexpected exception. Assertions verify the entire client/log result contains
none of the seeded marker. Missing/blank secrets, malformed flags, explicit
environments despite `NODE_ENV=production`, and the absence of any database
fallback are covered separately.

The sample bundle command produced:

```text
PASS sample mobile JS bundle contains the public API URL
PASS 3 seeded server-only markers absent; no API module imported
PASS mobile example allowlist and shared-contract boundary
PASS negative control detects a secret renamed to privateKey
Scope: esbuild sample; installed Expo/Metro native bundle remains follow-up work
```

This command bundles `apps/mobile/src/config.ts` with esbuild, seeds three fake
server secrets into the build process environment and inlines only the public API
URL. It searches the resulting bundle in memory, checks the mobile import graph
and its environment accesses, and scans shared contract sources for server
credential names/imports. Its negative control deliberately bundles a fake
signing secret under `privateKey` and confirms the marker remains inspectable.

## Acceptance mapping

| Criterion | Evidence |
|---|---|
| Development, preview and production are distinguishable with no default production database fallback | All three explicit names load and serve health; missing/unknown names fail even with `NODE_ENV=production`. Each environment fails if database is enabled without its explicit URI. |
| A missing enabled-feature secret produces a useful operator error and a generic client error | Real local runner and HTTP tests return `503 {"error":"service_unavailable"}` with separate named setting/rule diagnostics; no supplied values or stacks are logged. |
| Server credentials have no public mobile prefix and do not enter shared contract exports | Mobile example and source expose only `EXPO_PUBLIC_API_URL`; the sample bundle excludes three fake server markers and API imports. Contract source checks pass; public-prefixed credentials do not satisfy server configuration. |

## PR explanation and engineering-question answer

**What changed and why:** Added server configuration rules, first-request
validation, a JSON error handler, separate application env examples, public-only
mobile configuration and repeatable redaction/bundle checks. Operators can identify
missing settings without exposing credential values to clients or logs.

**Why renaming a bundled secret to `privateKey` does not make it private:** A
variable name changes its label, not where its bytes are distributed. The negative
control in `scripts/check-mobile-config.ts` exports
`privateKey = process.env.SESSION_SIGNING_SECRET` with a fake value substituted at
build time. The resulting JavaScript still contains the fake secret. The safe
mobile module exports only the public API URL; the real signing secret belongs
on the API host. React Native's [security guidance](https://reactnative.dev/docs/security)
and Expo's [environment-variable documentation](https://docs.expo.dev/guides/environment-variables/)
describe this inspectable bundle boundary.

**Limitations / follow-up:** This is a sample esbuild bundle, not an installed
Expo/Metro or signed native build; the mobile workspace remains a scaffold.
Database/signing gates validate configuration only; no database, signing or
provider integration is added. Credential isolation, live deployments and
provider-specific/cryptographic validation remain their implementation tickets.
No real credentials, external services, commit, remote PR or reviewer sign-off
were created; these are local PR-ready notes. Existing WHISP-004 working-tree
changes were retained.
