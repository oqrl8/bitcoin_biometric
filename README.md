# Sovereign Vault — Bitcoin Biometric Identity

A WebAuthn app that binds Bitcoin addresses to hardware fingerprint credentials. No passwords. No seed phrases. Your fingerprint *is* the key.

---

## What It Does

Sovereign Vault lets you prove ownership of a Bitcoin address using only your fingerprint. When you scan your finger, your device's secure enclave generates a cryptographic keypair and ties it to your vault. The private key never leaves your hardware — not even this server can read it.

There are three things you can do:

### 1. Create an Account

Tap the fingerprint button. Your device prompts you to scan your finger. A unique vault ID is generated and a P-256 keypair is created inside your secure enclave (Touch ID, Windows Hello, Android Biometrics). The public key is stored on the server; the private key stays locked in your hardware forever.

No username. No password. No form to fill out.

### 2. Prove Ownership (Verify)

Find your account in the Registered Accounts list and tap **Verify**. Your device prompts another fingerprint scan. The secure enclave signs a server-issued challenge with your private key. The server checks the signature against your stored public key — if it matches, ownership is proven. A sign counter increments each time, so any replay attack is immediately detectable.

### 3. Link Two Accounts as a Contingent Pair

This is the advanced feature. Two accounts can be cryptographically linked so that each one proves the other exists — without either revealing the other's full identity.

**How to link:**
1. On an existing account row, tap **Link**. A one-time link token is generated (valid for 30 minutes).
2. Copy the token and share it with another person (or open a second browser).
3. On the register panel, switch to the **Join Link** tab, paste the token, then scan your fingerprint.
4. Account B is created with a vault ID derived deterministically from Account A's commitment. Both accounts now share a commitment hash — the anonymous proof of their relationship.

Neither account stores the other's vault ID. Only the shared `sha256` commitment hash is recorded, making the link anonymous but mathematically verifiable.

---

## Message Stream Simulation

Don't have a fingerprint scanner handy? The **Message Stream Simulation** at the bottom of the page lets you run the full apply → eval flow without any hardware.

- Click **Simulate A (apply)** — a real P-256 keypair is generated in your browser using the SubtleCrypto API, Account A is registered, and a link token is emitted
- Click **Simulate B (eval)** — a second keypair is generated, the link token is applied, and Account B is created with a derived vault address
- The **Merkle Commitment Root** tree appears showing both accounts as leaves tied to the same commitment hash

This is not a fake mock — it uses real cryptographic key generation, just without the hardware attestation ceremony.

---

## Running It Yourself

### Requirements

- Node.js 24+
- pnpm 9+
- PostgreSQL database

### Setup

```bash
# Install dependencies
pnpm install

# Set your database connection
export DATABASE_URL="postgresql://user:password@host:5432/dbname"

# Push the schema to your database
pnpm --filter @workspace/db run push

# Start the API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Start the frontend (port 19149)
pnpm --filter @workspace/bitcoin-webauthn run dev
```

Then open `http://localhost:19149` in your browser.

> **Note:** WebAuthn only works on HTTPS or localhost. Fingerprint scanning will not work on plain HTTP in production. Use a reverse proxy with TLS for any public deployment.

### Other Commands

```bash
pnpm run typecheck                          # Full typecheck across all packages
pnpm --filter @workspace/api-spec run codegen  # Regenerate API hooks from OpenAPI spec
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| API | Express 5, Node.js 24 |
| Database | PostgreSQL, Drizzle ORM |
| Auth | WebAuthn / FIDO2 (`@simplewebauthn/server` v13) |
| Validation | Zod v4, drizzle-zod |
| Codegen | Orval (OpenAPI → React Query hooks + Zod schemas) |
| Monorepo | pnpm workspaces |

---

## How It Works Under the Hood

1. **Registration** — the browser calls `navigator.credentials.create()`. The OS prompts a fingerprint scan. The secure enclave generates a P-256 keypair and returns a signed attestation. The server verifies the attestation and stores the public key.

2. **Authentication** — the browser calls `navigator.credentials.get()` with a server-issued challenge. The secure enclave signs it. The server verifies the signature, increments the sign counter, and confirms identity.

3. **Contingent linking** — Account A's credential ID plus a random nonce produces a `linkToken`. Its `sha256` hash is the `commitment`. Account B's vault ID is `vault-linked-{commitment[:16]}` — deterministically derived. Both accounts store the commitment. Neither stores the other's vault ID.

4. **Replay protection** — every authentication increments a monotonic sign counter stored in the database. A counter that does not increase signals a cloned or replayed credential.

---

## Security Notes

- `userVerification: "required"` is enforced on every operation — PIN bypass is rejected
- Challenges are single-use and cleaned up immediately after verification
- The `rpID` is derived from the request hostname at runtime — works across dev and production domains without config changes
- Link tokens expire after 30 minutes and are invalidated on first use
