# WHISP API

WHISP-004 adds one process-liveness endpoint. WHISP-005 validates API
configuration on the first request and redacts configuration errors. Health does
not contact a database or prove that authentication, storage or other dependencies
are ready.

## Run locally

From the repository root, using Node.js with built-in `fetch` and `--import`
support (validated with Node.js 26.8.1):

```sh
npm ci --prefix apps/api
cp apps/api/.env.example apps/api/.env
npm run dev --prefix apps/api
```

The local runner binds to `127.0.0.1:3000`. Set `PORT` to choose another port.
`src/index.ts` exports the Express app without starting a listener; `src/local.ts`
owns local startup. The default export follows the
[Express on Vercel entry-point convention](https://vercel.com/docs/frameworks/backend/express#exporting-the-express-application).
Deployment and selecting a supported production Node version remain WHISP-002/006
work; no Vercel deployment has been validated here.

The development command loads `apps/api/.env` when present. `WHISP_ENV` is required
and must be `development`, `preview` or `production`; there is no production
fallback. The example disables database and signing checks. See the single
[configuration table and failure rules](../../docs/configuration.md) for public
mobile settings, server secrets and environment isolation.

## HTTP contract

| Request | Status | JSON body |
|---|---|---|
| `GET /api/health` | `200` | `{"status":"ok","service":"whisp-api","contractVersion":1}` |
| Unknown route, such as `GET /api/unknown` | `404` | `{"error":"not_found"}` |
| Unsupported method, such as `POST /api/health` | `404` | `{"error":"not_found"}` |
| Any request with invalid API configuration | `503` | `{"error":"service_unavailable"}` |

The `200` and `404` cases require valid API configuration. The operator receives
fixed setting names and failed rules for `503`; clients receive only the generic
error above. Unexpected application errors return `500` with
`{"error":"internal_error"}`.

Responses use `Content-Type: application/json; charset=utf-8`. The success body
uses the shared [HealthResponse](../../packages/contracts/src/health.ts) type.
`contractVersion` identifies this response shape, not the package or runtime
version. All three fields are fixed public values. Configuration middleware runs
before the handler; responses expose no settings, package details or connection
strings.

`200` means the health route handled the request successfully. `404` means no
handler matched the requested method and path. The final middleware explicitly
returns JSON instead of Express's default HTML 404, as described in the
[Express FAQ](https://expressjs.com/en/starter/faq/#how-do-i-handle-404-responses).

## Verify

```sh
npm test --prefix apps/api
npm run typecheck --prefix apps/api
npm run check:mobile-config --prefix apps/api
```

The request tests import the exported app and send real HTTP requests over an
ephemeral loopback port. They assert the exact public JSON body, status and content
type for health, unknown routes and an unsupported method.

With the local runner still running, use a second terminal:

```sh
curl -i http://127.0.0.1:3000/api/health
curl -i http://127.0.0.1:3000/api/unknown
npm run check:health --prefix apps/api
```

The fetch script checks the status, content type and parsed JSON for both routes.
For a different local port, pass the base URL:

```sh
npm run check:health --prefix apps/api -- http://127.0.0.1:3100
```

See the [WHISP-004 validation record](../../docs/validation/WHISP-004.md) for evidence
and the engineering-question answer. [WHISP-005's validation record](../../docs/validation/WHISP-005.md)
covers configuration failures, redaction and the sample mobile bundle check.
