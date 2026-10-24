**WORKSPACE WHISP**

WHISP is a privacy-first, pseudonymous communication app for Android and iOS. Its planned mobile client uses React Native and TypeScript. See the [architecture report](./WHISP_Architecture_Report_HLD_LLD.md) for the system design.

## Workspaces

| Workspace | Role |
|---|---|
| [`apps/mobile`](./apps/mobile) | Mobile application workspace for the Android and iOS client. |
| [`apps/api`](./apps/api) | Backend API workspace for the services used by the mobile client. |
| [`packages/contracts`](./packages/contracts) | Shared contracts workspace for types and interfaces used across the API and mobile app. |

## Repository status

These workspaces are scaffolded. Their package manifests do not yet describe implemented application features. Root-level npm workspace configuration and setup commands will be documented here when they are in place.