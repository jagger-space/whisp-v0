# WHISP — Privacy-First Social Platform
## Software Architecture Document (v1.0)

**Author:** Software Architect (30+ yrs experience)
**Scope:** High-level architecture, no implementation code
**Status:** Draft for review

---

## 1. Executive Summary

WHISP is a **zero-knowledge, anonymity-by-design** social platform. The architecture is built on four non-negotiable pillars:

1. **No PII ever leaves the device.** No email, phone, password, or legal name is collected, transmitted, or stored.
2. **Passkey-rooted, device-bound identity.** Authentication is local-first (works offline) and rooted in platform authenticators (FIDO2/WebAuthn).
3. **End-to-end encryption everywhere.** 1:1, group, calls, conferences, and the vault are all E2EE. The server is a blind relay.
4. **Untraceability.** Metadata minimization, sealed sender, Tor/mixnet transport, and no IP logging.

The server is deliberately **"dumb"**: it routes ciphertext, stores public keys, and manages group state — it cannot read content, cannot link identity to real-world attributes, and cannot decrypt the vault.

---

## 2. Design Principles

| Principle | Implication |
|---|---|
| **Zero-Knowledge Server** | Server never sees plaintext, private keys, or PII. |
| **Local-First Auth** | Passkey ceremony happens on-device; network is optional for unlock. |
| **Anonymity by Default** | No IP logging, sealed sender, cover traffic, no analytics SDKs. |
| **Minimize Metadata** | Only what is strictly required for routing is stored, and it is padded/obfuscated. |
| **Deniable Recovery** | Recovery via Shamir shares / social recovery — never via email/SMS. |
| **Cryptographic Agility** | All primitives versioned; post-quantum migration path reserved. |
| **Client-Side Trust** | Server cannot be trusted; all security properties hold even if server is compromised. |

---

## 3. System Context & High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         WHISP SYSTEM CONTEXT                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌─────────────┐        ┌──────────────────┐       ┌─────────────┐   │
│   │  Client A   │◄──────►│  WHISP Relay     │◄─────►│  Client B   │   │
│   │ (Mobile/    │  E2EE  │  Network         │ E2EE  │ (Mobile/    │   │
│   │  Desktop)   │  only  │  (Blind)         │ only  │  Desktop)   │   │
│   └──────┬──────┘        └────────┬─────────┘       └──────┬──────┘   │
│          │                        │                        │          │
│          │               ┌────────┴─────────┐              │          │
│          │               │  Auxiliary Svc   │              │          │
│          │               │  - Username Reg. │              │          │
│          │               │  - Group State   │              │          │
│          │               │  - Push Gateway  │              │          │
│          │               │  - TURN/STUN     │              │          │
│          │               └──────────────────┘              │          │
│          │                                                  │          │
│   ┌──────┴──────┐                                  ┌────────┴──────┐   │
│   │ Local Vault │                                  │ Local Vault   │   │
│   │ (Encrypted) │                                  │ (Encrypted)   │   │
│   └─────────────┘                                  └───────────────┘   │
│                                                                        │
│   Transport: Tor / Mixnet (default) or Direct TLS with ECH             │
└──────────────────────────────────────────────────────────────────────┘
```

**Trust boundary:** Everything inside the client is trusted; everything outside is untrusted. The relay and auxiliary services are treated as **honest-but-curious** at best, and **malicious** at worst.

---

## 4. Identity & Authentication Subsystem

### 4.1 Identity Model

Each WHISP account is a **cryptographic identity**, not a real-world one.

| Component | Description | Where it lives |
|---|---|---|
| **Identity Keypair** | Ed25519 (signing) + X25519 (key agreement). Root of trust. | Generated on-device; private key never leaves Secure Enclave/TPM. |
| **Passkey (FIDO2/WebAuthn)** | Platform credential bound to biometric/PIN. | Platform authenticator (Secure Enclave, TPM, StrongBox). |
| **Wrapping Key** | Derived from passkey assertion; encrypts the identity private key at rest. | Derived on-device, ephemeral in memory. |
| **Username** | Human-readable handle. Mapped to public key via registry. | Public registry (see §9). |
| **Device Keys** | Per-device keypairs for multi-device support. | Each device's secure storage. |

### 4.2 Offline Passkey Authentication Flow

**Goal:** User can unlock the app and decrypt the vault **without network access** and **without any PII**.

```
┌─────────────────────────────────────────────────────────────────┐
│                  OFFLINE UNLOCK CEREMONY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User opens WHISP                                              │
│  2. OS prompts biometric / device PIN via platform authenticator  │
│  3. Passkey assertion is produced locally (no network)            │
│  4. Assertion is used to derive Wrapping Key (HKDF)               │
│  5. Wrapping Key decrypts Identity Private Key in secure storage  │
│  6. Identity Private Key unlocks session + Vault Master Key       │
│  7. App is unlocked — fully offline                               │
│                                                                   │
│  Network is NOT required for steps 1–7.                           │
│  Network IS required only to send/receive messages later.         │
└─────────────────────────────────────────────────────────────────┘
```

**Key properties:**
- The passkey is **never transmitted** to the server (WebAuthn native).
- The identity private key is **wrapped at rest** by a key derived from the passkey assertion.
- There is **no password to phish** and **no email/SMS to intercept**.
- If the device is lost, the identity is unrecoverable unless the user opted into social/Shamir recovery (§4.5).

### 4.3 Server-Side Authentication (When Online)

When the client needs to talk to the relay:

1. Client signs a **server-issued nonce** with its Identity Private Key.
2. Server verifies signature against the registered public key for that username.
3. Server issues a **short-lived bearer token** (opaque, not tied to IP).
4. All subsequent requests are **sealed sender** — the server does not learn the sender identity from the envelope.

No password, no email, no phone — ever.

### 4.4 Multi-Device Enrollment

- Account identity keypair is **shared across devices** via a **device-to-device enrollment ceremony**:
  - New device generates a device keypair.
  - Existing device signs the new device's public key (QR code / local proximity).
  - Identity key is transferred **encrypted to the new device's public key**.
  - New device creates its own passkey wrapping the identity key.
- Server stores a **device list** (public keys only) for fan-out encryption.

### 4.5 Recovery (No PII)

Since there is no email/phone, recovery is opt-in and cryptographic:

| Method | Mechanism |
|---|---|
| **Recovery Code** | 24-word mnemonic generated at signup; user stores offline. |
| **Shamir Social Recovery** | Identity key split into *n* shares among trusted contacts; *k* needed to reconstruct. |
| **Vault-Stored Shares** | Encrypted recovery shares stored in the user's own vault. |

No recovery method relies on a third party knowing the user's real identity.

---

## 5. Cryptographic Architecture

### 5.1 Primitive Selection

| Purpose | Algorithm |
|---|---|
| Signing / identity | Ed25519 |
| Key agreement | X25519 |
| Symmetric AEAD | XChaCha20-Poly1305 |
| Hashing / KDF | BLAKE3 / HKDF-SHA256 |
| 1:1 session | X3DH + Double Ratchet (Signal-style) |
| Group session | MLS (RFC 9420) |
| Calls media | SRTP + DTLS; E2EE via Insertable Streams |
| Vault at rest | XChaCha20-Poly1305 with Argon2id-derived key |
| Post-quantum (roadmap) | Hybrid X25519 + ML-KEM (Kyber) |

### 5.2 Key Hierarchy

```
Passkey Assertion
      │
      ▼ (HKDF)
Wrapping Key ──► decrypts ──► Identity Private Key
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
            Session Keys       Vault Master Key    Device Keys
            (Double Ratchet)         │
                                     ▼
                              Per-Item Vault Keys
```

**Rule:** No key is ever derived from a password. The passkey is the sole root.

### 5.3 Sealed Sender

Every message envelope is encrypted such that **only the recipient** can learn who sent it. The relay sees:
- An opaque recipient routing token
- A ciphertext blob
- No sender identity, no IP (Tor), no timing correlation (cover traffic + jitter)

---

## 6. Communication Subsystem

### 6.1 Modes Supported

| Mode | Cardinality | Protocol | Notes |
|---|---|---|---|
| **Personal chat** | 1:1 | X3DH + Double Ratchet | Forward secrecy + post-compromise security per message. |
| **Group chat** | many:many | MLS (RFC 9420) | Scalable group key agreement; O(log n) updates. |
| **1:1 call** | 1:1 | WebRTC + E2EE (Insertable Streams) | SRTP with per-frame encryption. |
| **Conference call** | many:many | WebRTC SFU with E2EE | SFU relays only ciphertext; keys via MLS. |

### 6.2 Chat Pipeline

```
Sender Client                          Relay                          Recipient Client
─────────────                          ─────                          ────────────────
plaintext
   │
   ▼ encrypt (Double Ratchet / MLS)
ciphertext ──► sealed-sender envelope ──► store & forward ──► decrypt ──► plaintext
   │                                           │
   └── padding, jitter, cover traffic ─────────┘
```

- **Padding:** All messages padded to fixed size buckets (e.g., 256 B, 1 KB, 4 KB) to defeat length analysis.
- **Jitter:** Random send delay (0–3 s) to defeat timing correlation.
- **Cover traffic:** Constant-rate dummy messages when idle (optional, user-toggleable).

### 6.3 Calls & Conferences

- **Signaling** over the same sealed-sender chat channel (SDP/ICE candidates are E2EE).
- **Media** via WebRTC; **E2EE is applied at the application layer** so even the SFU cannot decrypt.
- **SFU (Selective Forwarding Unit)** only forwards encrypted frames; keys distributed via MLS.
- **TURN** servers are used for NAT traversal — they see only IPs, mitigated by Tor/relay chaining where feasible.

### 6.4 Group-Based Communication

- Groups are **MLS groups**: each group has a cryptographic group state.
- Membership changes trigger **MLS commits** (add/remove/update).
- Group metadata (name, avatar, description) is **encrypted to the group key** — server sees only an opaque group ID.
- **Admins** are defined by MLS group state, not server-side roles.

---

## 7. Secure Vault Subsystem

### 7.1 Purpose

A user-owned encrypted store for arbitrary data (files, notes, credentials, media) that **can only be decrypted after passkey authentication**.

### 7.2 Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      VAULT SUBSYSTEM                        │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  Passkey ──► Wrapping Key ──► Identity Key ──► Vault Master  │
│                                                              │
│  Vault Master Key (never leaves device)                      │
│        │                                                     │
│        ├──► per-item key (HKDF)                              │
│        └──► encrypts each item (XChaCha20-Poly1305)          │
│                                                              │
│  Ciphertext blobs ──► Local storage AND/OR encrypted cloud   │
│  (server stores opaque blobs; zero-knowledge)                │
└────────────────────────────────────────────────────────────┘
```

### 7.3 Guarantees

- **Confidentiality:** Server cannot decrypt vault contents.
- **Integrity:** AEAD tags detect tampering.
- **Availability:** User may store encrypted blobs locally and/or on relay (blinded).
- **Forward secrecy (optional):** Per-item keys can be rotated and old blobs re-encrypted.

---

## 8. Group Management Subsystem

### 8.1 Group Lifecycle

1. **Create** — client generates MLS group; picks encrypted group metadata; registers opaque group ID with relay.
2. **Invite** — inviter sends MLS Welcome message via sealed-sender chat.
3. **Join** — invitee processes Welcome, joins group state.
4. **Modify** — add/remove/update via MLS commits.
5. **Dissolve** — client signals group destruction; relay purges opaque state.

### 8.2 Server's Role

The relay stores only:
- Opaque group ID
- MLS ciphertext backlog (for offline members)
- No member list, no metadata, no plaintext

Member list is derivable only by group members from MLS state.

---

## 9. Username Registry

### 9.1 Requirements

- **Unique** usernames
- **No PII linkage**
- **Resistant to enumeration** (optional privacy mode)
- **Resistant to squatting** (rate-limited registration)

### 9.2 Approach

```
Registration:
  Client generates identity keypair
  Client picks username (e.g., "alice")
  Client computes commitment = H(username || public_key)
  Client submits (username, commitment) via blind-signature / ZK-proof channel
  Registry stores: username ──► public_key (or commitment)
  Registry does NOT store: IP, device fingerprint, timing

Lookup:
  Query username ──► Registry returns public_key
  (Optional: rate-limited, padded responses to prevent enumeration)
```

- **Uniqueness** enforced by the registry (first-writer-wins, with proof of key ownership).
- **Anonymity** preserved: the registry knows only that *some* key owns *some* username.
- **Enumeration resistance:** Optional mode where lookups require a ZK proof of a valid relationship (e.g., existing contact) — prevents mass scanning.

---

## 10. Privacy & Anonymity Layer

### 10.1 Untraceability Controls

| Threat | Control |
|---|---|
| IP correlation | Tor / mixnet default; no IP logging server-side |
| Timing correlation | Jitter, cover traffic, batching |
| Message size analysis | Fixed-size padding buckets |
| Sender identification | Sealed sender envelopes |
| Metadata leakage | Minimal relay state; encrypted group metadata |
| Push notification leakage | Push payloads are opaque; content fetched after wake-up |
| Analytics / telemetry | **None.** No third-party SDKs. |

### 10.2 Push Notifications

- Push gateway receives only a **wake-up token** and an **opaque blob reference**.
- No content, no sender, no group name in push payload.
- Client fetches and decrypts on wake.

### 10.3 Anti-Abuse Without PII

- **Proof-of-work** on account creation (rate-limits Sybil).
- **Reputation via web-of-trust** (optional, user-controlled).
- **Client-side spam filtering** (ML on-device, no server telemetry).
- **Block/report** is local; reports are E2EE to a moderation key (if enabled) — no reporter identity leaked.

---

## 11. Client Architecture

### 11.1 Layers

```
┌─────────────────────────────────────────────┐
│  UI Layer (platform-native or cross-plat)   │
├─────────────────────────────────────────────┤
│  Domain Layer (chats, groups, vault, calls) │
├─────────────────────────────────────────────┤
│  Crypto Layer (Double Ratchet, MLS, AEAD)   │
├─────────────────────────────────────────────┤
│  Identity Layer (passkey, key wrapping)     │
├─────────────────────────────────────────────┤
│  Transport Layer (Tor/mixnet, WebRTC, TLS)  │
├─────────────────────────────────────────────┤
│  Secure Storage (Secure Enclave / TPM /     │
│  StrongBox / Keychain / Keystore)           │
└─────────────────────────────────────────────┘
```

### 11.2 Platform Notes

- **iOS:** Secure Enclave + Keychain; passkey via ASAuthorization.
- **Android:** StrongBox / TEE + Keystore; passkey via Credential Manager.
- **Desktop:** TPM 2.0 or OS keychain; passkey via platform authenticator.
- **Web (optional):** WebAuthn + IndexedDB with non-extractable keys; limited by browser secure storage.

### 11.3 Offline-First Behavior

- Local message store is encrypted at rest with a key derived from the passkey.
- Outbound messages queue locally and flush when online.
- Vault is fully usable offline.
- Calls require network (obviously) but signaling is E2EE.

---

## 12. Server / Backend Architecture

### 12.1 Services

| Service | Responsibility | Data Stored |
|---|---|---|
| **Relay** | Store-and-forward ciphertext, sealed-sender envelopes | Opaque blobs + routing tokens |
| **Username Registry** | Username → public key mapping | Username + public key only |
| **Group State** | MLS ciphertext backlog | Opaque group IDs + ciphertext |
| **Push Gateway** | Wake-up notifications | Opaque tokens |
| **TURN/STUN** | NAT traversal for calls | Ephemeral, no logging |
| **Vault Blob Store** | Encrypted vault blobs (optional) | Opaque ciphertext |

### 12.2 Zero-Knowledge Properties

- **No plaintext** at rest or in transit (server-side).
- **No PII** in any database.
- **No IP logs** (or logs scrubbed within minutes; configurable).
- **No analytics.**
- **Blind routing:** Server cannot map sender → recipient from envelope alone.

### 12.3 Deployment Topology

- Relay nodes deployed as **Tor onion services** (primary) and **TLS with ECH** (fallback).
- **Federated or decentralized** option: relay nodes can be operated by independent parties; clients can pin to a set.
- **No single point of compromise** for identity: keys are client-side.

---

## 13. Data Flow Summary

### 13.1 Send a 1:1 Message

```
Alice (offline-capable)
  │
  ├─ Unlock via passkey (local)
  ├─ Encrypt with Double Ratchet session key
  ├─ Wrap in sealed-sender envelope (recipient token only)
  ├─ Pad + jitter
  └─ Send via Tor ──► Relay ──► Bob's queue
                                        │
Bob (online) ◄── Push wake-up ◄─────────┘
  │
  ├─ Fetch opaque blob
  ├─ Decrypt with session key
  └─ Display plaintext
```

### 13.2 Create a Group

```
Alice
  ├─ Generate MLS group state
  ├─ Encrypt group metadata
  ├─ Register opaque group ID with relay
  ├─ Send MLS Welcome to Bob, Carol (via sealed-sender)
  └─ Group is live
```

### 13.3 Unlock Vault

```
User
  ├─ Passkey assertion (local, offline)
  ├─ Derive Wrapping Key → Identity Key → Vault Master Key
  ├─ Decrypt requested vault item
  └─ Display / use
```

---

## 14. Threat Model & Security Controls

| Threat | Mitigation |
|---|---|
| Server compromise | Zero-knowledge design; E2EE; no plaintext server-side. |
| Network adversary | Tor/mixnet; E2EE; sealed sender; padding. |
| Device theft | Passkey + Secure Enclave; encrypted storage; remote wipe (optional). |
| Malicious relay | Cannot read content; cannot forge messages (signatures). |
| Username enumeration | Rate limits; optional ZK-gated lookup. |
| Sybil / spam | Proof-of-work at signup; client-side filtering. |
| Metadata correlation | Jitter, cover traffic, batching, no IP logs. |
| Quantum adversary (future) | Hybrid PQ roadmap (ML-KEM + X25519). |
| Insider at relay | Zero-knowledge; no PII; blind routing. |
| Push provider | Opaque payloads only. |

---

## 15. Technology Choices (High-Level)

| Layer | Candidate Technologies |
|---|---|
| Passkey | FIDO2 / WebAuthn (platform authenticators) |
| Crypto libs | libsodium, OpenMLS, Signal Protocol libraries |
| Group E2EE | MLS (RFC 9420) via OpenMLS |
| Calls | WebRTC + Insertable Streams + SRTP |
| Transport | Tor (Arti), optional mixnet, TLS 1.3 + ECH |
| Client | Native (Swift/Kotlin) or Rust core + thin UI |
| Backend | Rust/Go services; no plaintext stores |
| Storage | Opaque blob stores (S3-compatible) + minimal KV |
| Push | APNs/FCM with opaque payloads |

---

## 16. Risks & Open Questions

| Risk | Notes |
|---|---|
| **No PII recovery** | Account loss is permanent unless recovery opted-in. UX must strongly communicate this. |
| **Abuse moderation** | Anonymity makes moderation hard; relies on client-side tools + optional E2EE reporting. |
| **Regulatory pressure** | Some jurisdictions may demand backdoors; architecture must remain uncompromising. |
| **Multi-device complexity** | Device enrollment and key sharing are non-trivial; UX must be carefully designed. |
| **Tor performance** | Media calls over Tor are impractical; fallback to direct TLS with ECH. |
| **Post-quantum migration** | Hybrid schemes must be planned now to avoid future breakage. |

---

## 17. Summary

WHISP's architecture is **privacy as a first-class invariant**, not a feature:

- **Identity** is a passkey-rooted cryptographic keypair — no PII, offline-capable unlock.
- **All communication** (1:1, group, calls, conferences) is E2EE; the server is a blind relay.
- **Vault** is client-side encrypted, decryptable only after passkey authentication.
- **Groups** use MLS for scalable, forward-secure many:many encryption.
- **Usernames** are unique but unlinkable to real identity.
- **Anonymity & untraceability** are enforced via Tor/mixnet, sealed sender, padding, jitter, and zero server-side logging.

The server can be compromised, subpoenaed, or malicious — and **still cannot read a single message, identify a single user, or decrypt a single vault item**. That is the architectural guarantee.