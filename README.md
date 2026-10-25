**WORKSPACE WHISP**

WHISP is a privacy-first, pseudonymous communication app for Android and iOS. Its planned mobile client uses React Native and TypeScript. See the [architecture report](./WHISP_Architecture_Report_HLD_LLD.md) for the system design.

## Workspaces

| Workspace | Role |
|---|---|
| [`apps/mobile`](./apps/mobile) | Mobile application workspace for the Android and iOS client. |
| [`apps/api`](./apps/api) | Backend API workspace for the services used by the mobile client. |
| [`packages/contracts`](./packages/contracts) | Shared contracts workspace for types and interfaces used across the API and mobile app. |

## Repository status

The [API workspace](./apps/api/README.md) implements `GET /api/health` and a JSON
404 fallback, with local startup and request-level checks. API configuration now
requires an explicit environment and validates enabled-feature credentials through
a redacted error path; see [configuration](./docs/configuration.md). The contracts workspace
contains shared types and username validation; the mobile workspace is scaffolded.
Each implemented package currently has its own setup commands and lockfile.
Root-level npm workspace configuration remains follow-up work in WHISP-002.
