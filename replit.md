# Sovereign Vault — Bitcoin Biometric Identity

A WebAuthn-based sovereign identity app that cryptographically binds Bitcoin addresses to hardware biometric credentials (Touch ID, Windows Hello, Android Biometrics) and proves ownership without ever exporting private keys.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/bitcoin-webauthn run dev` — run the frontend (port 19149)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- WebAuthn: `@simplewebauthn/server` v13

## Where things live

- API spec: `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema/credentials.ts` — `webauthn_credentials` + `webauthn_challenges` tables
- Backend routes: `artifacts/api-server/src/routes/webauthn.ts`
- Frontend: `artifacts/bitcoin-webauthn/src/`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`
- Generated Zod schemas: `lib/api-zod/src/generated/api.ts`

## Architecture decisions

- Public keys stored as base64 text in PostgreSQL (avoids bytea driver complexity in Drizzle)
- Challenges stored in DB with bitcoin address binding (cleaned up after use to prevent replay)
- Authentication challenge embeds the target Bitcoin address as JSON payload — prevents intercepted fingerprint signatures being replayed for a different wallet
- `userVerification: "required"` enforced on both registration and authentication — hardware biometric only, PIN bypass causes immediate failure
- `rpID` derived from `req.hostname` at runtime so the app works across dev/prod domains without config changes

## Product

- **Phase 1 — Bind Address**: Enter a Bitcoin address, scan fingerprint → creates an isolated hardware keypair (P-256/secp256r1) in the device's secure enclave, bound to the address
- **Phase 2 — Generate Proof**: Select a registered address, scan fingerprint again → generates a cryptographic signature proving you control the hardware key bound to that address
- **Credential Registry**: Lists all registered bindings with sign counts (replay attack detection indicator)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- WebAuthn only works on HTTPS or localhost — will fail on plain HTTP in production
- `rpID` must exactly match the hostname the browser sees — mismatches cause silent verification failures
- The `@simplewebauthn/types` package is now bundled inside `@simplewebauthn/server` v13 — import types from `@simplewebauthn/server`
- After each OpenAPI spec change, re-run codegen before using the updated types

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
