**WHISP should be a privacy-first social communication app built around passkeys, end-to-end encryption, private groups, and a personal encrypted vault.** Its architecture can target one million registered beta users, but production readiness must be demonstrated through security reviews, load tests, and recovery drills.

Following **learn-through-projects**, we’ll use WHISP to learn how architects translate product promises into system boundaries, data flows, capacity assumptions, and measurable acceptance criteria. This is an architecture proposal; no code is included.

## 1. Define the product promise precisely

> **WHISP — Your conversations. Your keys. Your space.**  
> Join with a username and passkey. Share private messages, talk with your groups, and protect personal files in an encrypted vault—without giving WHISP your email, phone number, or password.

Three distinctions shape the entire design:

| Requested promise | Practical architectural meaning |
|---|---|
| Offline passkey authentication | An enrolled device can unlock locally while offline. Creating an account, claiming a globally unique username, and authenticating to WHISP’s servers require connectivity. |
| Anonymous communication | WHISP supports pseudonymous accounts without collecting real-world identity. Network addresses, timing, usernames, and relationships can still reveal information. |
| Vault decrypts after authentication | Authentication authorizes access, while a separate client-held cryptographic key decrypts the vault. A successful server login alone must never decrypt it. |

WebAuthn authenticates users through a challenge-response exchange with a relying party. Local device verification and online server authentication are different operations. [Level 2](https://www.w3.org/TR/webauthn-2/?utm_source=chatgpt.com)

**Initial scope:** private profiles, exact-username discovery, personal chats, private groups, voice/video calls, conferences, and vault storage. Public feeds, advertising, federation, server-side AI analysis, and searchable public content are deferred because they introduce different privacy and moderation requirements.

## 2. Start with one concrete journey

Our reference user, **Mira**, should be able to:

1. Choose an available username and create a passkey.
2. Receive a recovery kit and understand what losing it means.
3. Invite a friend through a username or QR code.
4. Exchange encrypted messages and attachments.
5. Create a private group and start an encrypted conference.
6. Save a document in her vault.
7. Unlock downloaded content offline.
8. Link a second device and revoke a lost device.

This journey exposes the important architectural questions early: **Who holds the keys? What survives device loss? What can the server observe? What happens during disconnection?**

## 3. The overall architecture

The most important boundary is between **trusted user devices**, which handle plaintext and encryption keys, and **WHISP infrastructure**, which transports and stores encrypted content.

| Layer | Components | Responsibility |
|---|---|---|
| User devices | Mobile apps; companion web app | Local authentication, encryption, decryption, encrypted local storage, offline queue |
| Internet edge | DDoS protection, load balancers, API gateway | Admit connections, enforce limits, route requests |
| Account control | Authentication, username registry, device directory, sessions | Verify passkeys and manage account/device authorization |
| Communication control | Conversation membership, message delivery, call signaling | Authorize delivery and coordinate conversations |
| Real-time delivery | WebSocket gateways, durable delivery workers | Push encrypted events and support reconnects |
| Media infrastructure | Regional SFUs and TURN relays | Forward encrypted audio/video |
| Persistent storage | Relational database, durable message store, object storage | Store account records, ciphertext, encrypted files |
| Operations | Deployment pipeline, metrics, incident response, backups | Operate and recover the service |

**An SFU**, or selective forwarding unit, forwards media streams to conference participants instead of making every participant upload a separate stream to everyone else.

**TURN** relays help calls work when network restrictions prevent direct connections. [webrtc.org](https://webrtc.org/getting-started/peer-connections?utm_source=chatgpt.com)

### Deployment structure

Begin with a **modular application backend**, rather than dozens of independent microservices. Keep account, username, device, group, and vault authorization as explicit modules.

Deploy these workloads separately because their scaling behavior differs:

- API and account operations.
- Long-lived WebSocket connections.
- Durable message processing.
- Media forwarding and relay traffic.
- Background storage and cleanup work.

A million accounts does not automatically require a complex microservice estate. Clear boundaries and measured bottlenecks should drive extraction.

## 4. Identity, usernames, and offline access

### Account creation

1. The server reserves a random internal account identifier.
2. The user selects a username.
3. A database uniqueness constraint atomically claims the normalized username.
4. The device registers a passkey.
5. The device generates separate messaging and vault keys.
6. The user configures recovery and receives an explanation of the consequences.

**A username is a discoverable label, not a cryptographic identity.** Messages and permissions reference the immutable account identifier, so renaming does not break conversations.

For beta, use a simple username policy: restricted characters, case-insensitive uniqueness, reserved system names, and controlled rename frequency. Avoid immediate recycling of old usernames to reduce impersonation.

### Three separate key responsibilities

| Key category | Purpose |
|---|---|
| Passkey | Prove authorization to access the WHISP account |
| Device messaging keys | Authenticate devices and protect conversations |
| Vault keys | Protect personal files and encrypted vault metadata |

Never derive vault encryption keys from passkey signatures.

On supported platforms, the WebAuthn PRF extension can contribute secret material for wrapping a vault key. Support must be tested across the intended devices; it cannot be assumed merely because passkeys work. Native apps can instead use locally protected keys gated by platform authentication. [Level 3](https://www.w3.org/TR/webauthn-3/?utm_source=chatgpt.com)

### What offline means

An already enrolled device can:

- Unlock its locally protected keys.
- Read previously downloaded messages and vault files.
- Compose messages into an encrypted outgoing queue.

It cannot:

- Claim a username.
- Receive fresh messages.
- Complete a new server login.
- Discover that the server has revoked the device.

That last limitation is fundamental: **remote revocation cannot instantly erase an offline device or plaintext it already possesses.**

## 5. Encrypted personal and group messaging

Use a reviewed implementation of **Messaging Layer Security, or MLS**, as the proposed conversation encryption foundation. Treat a personal conversation as a small group containing the participants’ authorized devices.

MLS provides a standardized foundation for group key establishment and updates, including forward secrecy and post-compromise security under its protocol assumptions. Application identity, delivery, recovery, and device management remain WHISP’s responsibility. [RFC Editor](https://www.rfc-editor.org/info/rfc9420/?utm_source=chatgpt.com)

### Message flow

1. The sender’s device verifies the conversation’s current membership state.
2. It encrypts the message locally.
3. The server accepts a ciphertext envelope with a unique message identifier.
4. Durable storage records it before acknowledging acceptance.
5. Delivery workers notify recipient devices.
6. Recipients decrypt locally and acknowledge receipt.

**Accepted, delivered, and read must be distinct states.** A server acknowledgment means the message is durably accepted, not that someone has read it.

### Required contracts

| Operation | Required behavior |
|---|---|
| Send | Retrying the same message identifier does not create duplicate messages |
| Reconnect | Resume from a delivery cursor and reconcile missing events |
| Group membership change | Apply an authorized, ordered cryptographic membership update |
| Remove member | Rotate group state so the removed device cannot decrypt future epochs |
| Upload attachment | Encrypt locally, upload ciphertext, send its key inside the encrypted conversation |
| Delete message | Remove service-held copies according to policy; do not promise erasure from recipients’ devices |

New members should receive **no automatic historical access** in the initial design. Any history-sharing feature needs an explicit, visible decision.

### Preventing silent key substitution

Encryption is insufficient if a compromised directory can quietly replace a friend’s device keys.

Include:

- QR or safety-code verification.
- Visible device additions and identity-change warnings.
- A verifiable key-transparency design before broad launch.
- User approval for device linking.

An independently authenticated device roster is essential; a server session alone should not authorize a new device to decrypt conversations.

## 6. Encrypted calls and conferences

Use **WebRTC for media transport**, with application-level media encryption that remains intact through the SFU.

SFrame provides a standardized approach to encrypting media frames while allowing forwarding infrastructure to operate without access to the media content. Its key distribution must be designed separately. [rfc-editor.org](https://www.rfc-editor.org/rfc/rfc9605.html?utm_source=chatgpt.com)

| Communication mode | Proposed route | Key behavior |
|---|---|---|
| Personal call | Relayed media by default | Only authorized endpoints hold media keys |
| Group conference | Regional SFU | Clients encrypt before media reaches the SFU |
| Membership change | Update membership and rotate media keys | Departed participants lose future access |

Bind media-key distribution to authenticated conversation membership, using a reviewed integration with domain-separated keys.

For privacy, avoid direct peer connections by default so participants do not receive one another’s network addresses. Validate this through packet inspection on every supported platform.

**Tradeoff:** relaying improves participant-to-participant IP privacy but increases bandwidth costs. WHISP’s infrastructure still observes connections.

For beta:

- Limit conferences to 25 participants.
- Limit simultaneous visible video streams.
- Adapt video quality to bandwidth.
- Disable server-side recording and transcription.
- Fail closed if media encryption is unsupported.

Do not silently downgrade an encrypted call to a weaker mode.

## 7. The encrypted vault

Use **envelope encryption**: each file has its own random encryption key, and those keys are protected by a separate vault master key.

| Item | Where it exists |
|---|---|
| File plaintext | Authorized user device |
| Encrypted file | Object storage and optional local cache |
| File encryption key | Inside an encrypted vault manifest |
| Vault master key | Wrapped for authorized devices and recovery |
| Storage access credentials | Short-lived, scoped server authorization |

Encrypt filenames, notes, and other sensitive vault metadata as well as file contents.

### Unlock sequence

1. The user completes local verification.
2. The platform releases or unwraps the device’s vault-unlocking material.
3. The client unwraps the vault master key.
4. The client downloads ciphertext if necessary.
5. Decryption happens locally.
6. Auto-lock removes accessible key material from memory as far as the platform permits.

Authentication gates key release; it does not prevent screenshots, malware, or an authorized user from copying decrypted content.

### Recovery must be explicit

Offer:

- Approval from an existing trusted device.
- A high-entropy offline recovery kit.
- Optional additional trusted devices or security keys.

**Account recovery and encrypted-data recovery are separate capabilities.** A restored or synchronized passkey must not be assumed to restore messaging history or the vault.

If every authorized device and recovery secret is lost, WHISP cannot recover encrypted content. Communicate that during onboarding.

## 8. Privacy and abuse controls

Position WHISP as **privacy-first and pseudonymous**, with clearly stated limits.

| Observer | What may remain visible |
|---|---|
| WHISP infrastructure | IP addresses, connection timing, delivery destinations, ciphertext sizes, some membership metadata |
| Push providers | Device tokens and notification timing |
| Conversation participants | Shared content, visible identity, group membership |
| Compromised endpoint | Plaintext and keys available on that endpoint |

Use generic push notifications such as “New activity.” Keep message previews off by default. Avoid contact-book uploads, advertising identifiers, third-party trackers, and plaintext content in logs.

Set explicit retention policies for delivery metadata, undelivered ciphertext, diagnostics, deleted objects, and backups. Encryption does not make indefinite retention harmless.

Privacy also needs usable abuse controls:

- Message requests from strangers.
- Blocking and group invitation permissions.
- Signup, username-lookup, messaging, and calling quotas.
- Progressive limits for new accounts.
- User-initiated reports that clearly disclose which selected content will be shared with moderators.

Because WHISP cannot inspect encrypted conversations, moderation must combine user reports, account behavior, and controls that do not require routine plaintext access.

## 9. Capacity planning for the first million users

**One million registered users is an adoption target, not a workload specification.**

The following are illustrative planning assumptions, not measured performance:

| Dimension | Beta planning assumption |
|---|---:|
| Registered accounts | 1,000,000 |
| Daily active users | 200,000 |
| Peak online users | 50,000 |
| Peak device connections | 75,000 |
| Messages per active user per day | 40 |
| Daily logical messages | 8,000,000 |
| Average logical message rate | About 93 per second |
| Illustrative 20× peak | About 1,850 per second |
| Peak concurrent media participants | 5,000 |
| Initial group limit | 250 accounts |
| Initial conference limit | 25 participants |

A **logical message** is one user action. Delivering it to many devices creates additional work. Large groups, device counts, attachments, and presence traffic can dominate the logical message rate.

At an assumed 2 KB per stored logical message envelope, eight million messages represent approximately **16 GB/day before replication, indexing, and delivery overhead**. Attachments are additional.

If 5,000 media participants each receive an average of 1 Mbps, outbound media alone is approximately **5 Gbps**, or **2.25 TB/hour**, before protocol overhead. Actual conference layouts and quality settings change this substantially.

This is why media quotas and bandwidth measurements belong in the architecture from the beginning.

### Scaling strategy

| Workload | Scaling approach |
|---|---|
| API requests | Stateless replicas behind load balancers |
| WebSocket connections | Scale by connections, memory, and event-loop pressure |
| Message delivery | Partition by conversation; preserve ordered membership events |
| Usernames | Authoritative relational uniqueness |
| Files | Direct ciphertext upload/download through object storage |
| Presence | Short-lived cache; loss must not lose messages |
| Calls | Regional SFU/TURN pools sized by bandwidth and forwarding load |
| Background work | Durable queues with retries, backpressure, and dead-letter handling |

Scale from measurements. Avoid committing to database sharding until storage volume, partition pressure, or throughput justifies it.

## 10. Deployment and production acceptance

Use a managed cloud foundation with:

- A primary data region across multiple availability zones.
- Stateless application replicas across those zones.
- Managed relational storage with failover and point-in-time recovery.
- Durable message storage and queues.
- Encrypted object storage.
- Regional media infrastructure near beta users.
- A secondary recovery region with documented replication limits.

Choose the primary region from the actual beta audience. Start with one authoritative write region to simplify username claims and membership ordering. Multi-region active-active writes add conflict and recovery complexity.

### Proposed service objectives

These are **targets to validate**, not promises already achieved.

| Area | Initial target |
|---|---|
| Core account and messaging API availability | 99.95% monthly |
| Message acceptance latency | p95 below 300 ms in the home region |
| Online delivery latency | p95 below 1 second under defined healthy-network conditions |
| Regional disaster recovery | Restore core service within 60 minutes |
| Regional disaster data-loss window | At most 5 minutes, with exceptions explicitly documented |

Production release gates should include:

- Independent review of cryptography integration and client key storage.
- Passkey and recovery testing across the supported-device matrix.
- Load tests at the planned peak, plus reconnect storms and group fan-out.
- Database failover, queue outage, storage outage, and SFU-loss drills.
- Backup restoration with actual data-integrity verification.
- Audited administrative access and signed release processes.
- Monitoring that excludes content and cryptographic secrets.

For the web client, recognize an additional trust boundary: compromised delivered JavaScript can access plaintext during use. A strict content-security policy helps against some attacks but cannot fully protect against a compromised application release. Client supply-chain security is therefore part of WHISP’s encryption story.

## 11. Learn architecture through six WHISP milestones

Each milestone extends the same product. The prototype demonstrates behavior; the production gates establish evidence.

| Milestone | Observable deliverable | Concepts learned | Dependency | Completion evidence |
|---|---|---|---|---|
| 1. Identity and local unlock | Username, passkey login, offline unlock | Identity, authentication, key custody | None | Username race, login replay, offline and recovery checks |
| 2. Personal messaging | Two users exchange encrypted messages | Ciphertext delivery, acknowledgments, retries | 1 | Server cannot decrypt; reconnect does not lose or duplicate messages |
| 3. Groups and devices | Private groups and linked devices | Membership epochs, device trust, revocation | 2 | Removed devices cannot decrypt future messages |
| 4. Vault | Upload, unlock, and recover private files | Envelope encryption, key wrapping, recovery | 1 | Storage dump contains no plaintext; recovery drill succeeds |
| 5. Calls and conferences | Personal and 25-person group calls | Signaling, SFU, TURN, media encryption | 3 | Relay cannot decrypt; membership changes rotate keys |
| 6. Beta operations | Controlled production rollout | Capacity, observability, incident recovery | All | Load evidence, restore drills, independent security review |

Roll out progressively: internal users → invited pilot → limited public beta → larger cohorts. Advance based on measured reliability, abuse rates, recovery success, and media cost.

## 12. Your first milestone: prove the identity model

Before choosing infrastructure sizes, produce three design artifacts:

1. **Account lifecycle:** creation, username claim, device addition, recovery, revocation, deletion.
2. **Key ownership matrix:** every key, its holder, backup method, and loss consequence.
3. **Failure walkthrough:** Mira loses her phone, has no internet, or discovers an unauthorized device.

Use these as planning tickets; they have not been created in an external tracker.

| Ticket | Objective and prerequisite | Acceptance criteria and verification |
|---|---|---|
| WHISP-001 | Define the privacy contract; no prerequisite | List what each observer sees. Walk through signup, chat, call, and vault access. |
| WHISP-002 | Define account and username lifecycle; depends on 001 | Concurrent claims have one winner; rename preserves identity; deletion and reuse policies are explicit. |
| WHISP-003 | Define device and key lifecycle; depends on 001 | Every key has an owner, purpose, recovery path, and loss consequence. Review the lost-phone scenario. |
| WHISP-004 | Define offline access and recovery; depends on 002–003 | Distinguish local unlock from server login; explain offline revocation limits and unrecoverable data loss. |

The first architectural decision to defend is:

**“Mira can authenticate on a replacement phone. What additional evidence should WHISP require before that phone can decrypt her vault?”**

A defensible answer separates account access from decryption authority and identifies exactly which trusted device or recovery secret transfers that authority. That distinction is the foundation on which WHISP’s privacy promise depends.