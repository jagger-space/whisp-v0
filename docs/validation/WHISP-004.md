# WHISP-004: typed HTTP health response

Date: 25 October 2026  
Scope: local Express requests; no database, authentication or deployment.

## Change and invariant

`GET /api/health` returns exactly the public `HealthResponse` contract with HTTP
200. The deployment entry point exports the app without opening a listener. A
separate local runner owns the port. The final middleware returns a fixed JSON
404 for unmatched routes and unsupported methods. The handler does not read
environment values, enumerate packages or open database/network connections.

The shared contract lives in `packages/contracts/src/health.ts`. Its literal
fields prevent accidental success-response changes from type-checking. The
request tests independently check the serialized body, including the absence of
extra properties, so a TypeScript annotation alone is not the evidence.

## Reproduce

From the repository root:

```sh
npm ci --prefix apps/api
npm test --prefix apps/api
npm run typecheck --prefix apps/api
npm run typecheck --prefix packages/contracts
npm run dev --prefix apps/api
```

In another terminal:

```sh
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/unknown
npm run check:health --prefix apps/api
```

## Recorded evidence

Environment: macOS, Node.js 26.8.1, npm 11.19.0. Only fixed public example values
appear below. Local socket operations required execution outside the Codex
sandbox because it denied loopback listen/connect with `EPERM`.

`npm ci --prefix apps/api` succeeded from the new package lockfile using an
empty temporary npm cache (82 packages installed, zero reported vulnerabilities).
The initial sandbox attempt could not resolve `registry.npmjs.org`; the retry
with network access completed successfully. Tests and type checks passed again
after this reinstall.

Request-level checks import the exported app, bind an ephemeral loopback port
and exercise actual HTTP serialization:

```text
PASS GET /api/health: 200, JSON content type, exact public response
PASS GET /api/unknown: 404, JSON content type, {"error":"not_found"}
PASS GET /: 404, JSON content type, {"error":"not_found"}
PASS POST /api/health: 404, JSON content type, {"error":"not_found"}
tests 4; pass 4; fail 0
PASS API TypeScript check
PASS shared contracts TypeScript check
```

The local runner and curl produced these status/body pairs (variable HTTP
headers omitted):

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
{"status":"ok","service":"whisp-api","contractVersion":1}

HTTP/1.1 404 Not Found
Content-Type: application/json; charset=utf-8
{"error":"not_found"}
```

The fetch script checked both status codes, JSON content types and parsed bodies
and agreed with curl:

```text
GET /api/health -> 200 {"status":"ok","service":"whisp-api","contractVersion":1}
GET /api/unknown -> 404 {"error":"not_found"}
```

## PR explanation and engineering-question answer

**What changed and why:** The first executable API route now has a shared typed
response, separate local startup, a deliberate JSON fallback, a reproducible
package lockfile and HTTP checks. `200` means that the health handler successfully
answered; `404` means that no handler matched the requested method/path.

**Why process liveness does not prove database readiness:** This route can return
`{"status":"ok","service":"whisp-api","contractVersion":1}` even when MongoDB
is unreachable, because it never contacts MongoDB. A username claim would still
fail if the database were unavailable or lacked a writable majority. A future
readiness check needs a bounded check of the dependencies required for that
operation; this endpoint only demonstrates that the HTTP process can respond.

**Limitations / follow-up:** WHISP-002's root workspace setup and production Node
selection remain incomplete; this ticket uses package-local scripts and a
lockfile. WHISP-006 owns deployment evidence. No database-readiness guarantee or
live Vercel behavior was tested. No commit, remote PR or human reviewer sign-off
is recorded; these are local PR-ready notes.
