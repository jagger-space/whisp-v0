# WHISP-001: deployment-map walkthrough and review notes

Date: 22 October 2026  
Scope: documentation-only review of [ADR 001](../decisions/001-vercel-runtime.md), using the [ticket](../../tickets/01-foundation/WHISP-001.md), [architecture report](../../WHISP_Architecture_Report_HLD_LLD.md) and [source inventory](../../tickets/SOURCES.md). No application, database or deployment exists in this workspace; the observations below are design trace results, not runtime measurements. Only disposable example identifiers appear here.

## Reproducible walkthrough

Open the ADR's map and ownership table. Trace each case below, identify the durable owner before removing the API instance, then trace the next request to a different instance using only that owner's state. A missing owner would fail this walkthrough.

| Case | Steps to trace | Recorded design observation |
|---|---|---|
| Happy-path message | An authorized device encrypts `example-message-001`; HTTPS reaches the Node.js/Express API; an authorized MongoDB transaction commits ciphertext and outbox work; the API acknowledges; recipient cursor polling reads ciphertext and the device decrypts. | API, persistence and decryption have distinct owners. No plaintext/content key needs to enter a server. Background push is not required for foreground reconciliation. |
| API instance disappears after commit, before response | Keep the same committed example and terminate instance A in the diagram before its response arrives. Client retries the same operation through instance B. | MongoDB ciphertext, operation/deduplication records and outbox work survive. A's heap, request buffers and connection handles do not. B must use durable idempotency state to return/reconcile the committed result rather than create a second message. Implementation is assigned to the later messaging/idempotency tickets. |
| API instance disappears before commit | Remove A before its transaction commits and before any durable acknowledgement. | No success may be assumed. The client retains outgoing work and retries with the same identity; B checks durable state and either finds the commit or performs the missing operation. |
| Background handler disappears | Trace an outbox event to a bounded handler, then remove it after an external effect but before completion is recorded. | MongoDB retains event identity, lease and retry state. A later run uses fencing plus effect-specific idempotency/reconciliation; duplicate delivery is possible. Cron and request-tail promises do not own the work. |
| Database majority unavailable | Remove MongoDB's required majority while tracing a new mutation. | API rejects authoritative writes and does not acknowledge durability. Local encrypted cache may still be unlocked; memory cannot replace MongoDB's permission authority. |
| API replaced during file transfer or call | After scoped transfer/admission authorization, remove the API while following the direct object/media arrows. | Existing data paths are external; replacing an API instance alone does not delete stored ciphertext or relay state. New authorization, expiry or signaling may still require API availability. Relay failure itself can interrupt a call. |
| Future gateway disappears | Remove the optional socket gateway and connect to another instance. | Connection/room memory is lost. Reauthentication and cursor replay use durable state; authorized polling remains the fallback. |

The failure example assumes external stores remain healthy. API-instance loss is different from database loss or regional disaster; backups and restore tests belong to later operations tickets.

## Acceptance review

| Ticket requirement | Evidence in ADR | Walkthrough result |
|---|---|---|
| Names report overrides and preserves client-held content keys | Report comparison explicitly covers A2–A3, B1–B5 and E1, plus affected B7/C9/D3/D6 assumptions; ownership and key-custody paragraphs preserve device-held keys. | Satisfied by document inspection |
| Every component has runtime, host, durable-data owner and failure consequence | Ownership table covers mobile, edge/static, API, MongoDB, object storage, jobs, notifications, media and optional gateway/Redis/broker/workers. Unselected provider runtimes are explicitly deferred. | Satisfied by document inspection |
| Distinguishes Vercel control API from external data/media/optional workers | Separate Mermaid host boundaries, direct ciphertext/media arrows, staged delivery choices and cost table. | Satisfied by document inspection |
| Explains instance loss and compares SOURCES.md | Cases above distinguish durable MongoDB records from lost heap; ADR includes an entry-by-entry source comparison and current primary documentation links. | Satisfied by walkthrough |

## Documentation checks

Executed on 22 October 2026 with Python's standard library against the ADR, this walkthrough and tickets/README.md. The check resolved every relative Markdown file link against its containing directory and verified paired code fences.

```text
PASS: 30 local file links resolve across 3 changed/new documents.
PASS: Markdown code fences are balanced.
Not run: application checks; this workspace contains documentation only.
```

## PR-ready explanation

**What changed and why:** ADR 001 records one deployment map before application scaffolding: Node.js/TypeScript/Express on Vercel, external MongoDB/object storage/SFU/TURN, foreground polling, bounded outbox execution and optional later realtime/workers. It explicitly supersedes the report's production Deno assumption while retaining one backend codebase and client-held content keys.

**Invariant and owner:** Replacing an API instance must not lose acknowledged durable state or create decryption authority. Authoritative transactions, deduplication and outbox records belong in MongoDB; protected content keys belong on authorized devices. Enforcement code and live failure tests are work for the linked implementation tickets.

**Evidence:** The trace table records successful ciphertext acceptance/retrieval, process disappearance before and after commit, interrupted background work, database unavailability and gateway replacement. The ADR's source comparison checks the deployment choices against SOURCES.md and the linked current Vercel documentation.

**Engineering-question answer:** Request buffers, reconstructible caches, driver connection pools and current socket handles can live only in memory because their loss can be recovered from durable owners. Acknowledged ciphertext, invitation-use counts, revocations, deduplication results, outbox retries and replay progress must survive deployment. For example, if `example-message-001` commits and the API response is lost, instance B needs MongoDB's stored operation result to recognize the retry. A module-level `Map` would disappear with A and could allow duplicate acceptance. Process heap variables disappear; separately stored deployment environment configuration can be supplied to B again, so configuration and heap are different kinds of state.

**Material limitations / follow-up:** No paid plan/provider, exact Node version, live WebSocket result, capacity or recovery guarantee is selected here. WHISP-002/006 prove runtime setup/deployment; WHISP-065/066 prove durable work; WHISP-068 decides realtime; WHISP-089 and later media tickets gate native encrypted calls. This directory has no Git repository or remote, so these are local PR-ready notes; no commit or PR was created. Human reviewer/tutor sign-off remains unrecorded.
