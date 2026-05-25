import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { db, webauthnCredentialsTable, webauthnChallengesTable, webauthnLinksTable } from "@workspace/db";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

const router = Router();

function getRelyingParty(host: string) {
  const hostname = host.split(":")[0];
  return {
    rpName: "Sovereign Identity Portal",
    rpID: hostname,
    origin: `https://${hostname}`,
  };
}

function validateBitcoinAddress(address: string): boolean {
  // Basic validation: legacy (1...), P2SH (3...), bech32 (bc1...), bech32m (bc1p...)
  return /^(1|3)[A-HJ-NP-Za-km-z1-9]{25,34}$/.test(address) ||
    /^bc1[a-z0-9]{6,87}$/.test(address);
}

// POST /api/webauthn/register/begin
router.post("/webauthn/register/begin", async (req, res) => {
  const { bitcoinAddress } = req.body as { bitcoinAddress?: string };

  if (!bitcoinAddress || typeof bitcoinAddress !== "string" || bitcoinAddress.trim().length === 0) {
    res.status(400).json({ error: "INVALID_ADDRESS", message: "A valid account identifier is required" });
    return;
  }

  // Check if already registered
  const existing = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.bitcoinAddress, bitcoinAddress))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({
      error: "ALREADY_REGISTERED",
      message: "This Bitcoin address is already bound to a biometric credential",
    });
    return;
  }

  const { rpName, rpID } = getRelyingParty(req.hostname);

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: `btc-${bitcoinAddress.slice(0, 8)}`,
    userDisplayName: `Bitcoin Holder (${bitcoinAddress.slice(0, 8)})`,
    userID: new TextEncoder().encode(bitcoinAddress),
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "required",
    },
    excludeCredentials: [],
  });

  // Store challenge
  await db.insert(webauthnChallengesTable).values({
    challenge: options.challenge,
    bitcoinAddress,
    type: "registration",
  });

  res.json(options);
});

// POST /api/webauthn/register/complete
router.post("/webauthn/register/complete", async (req, res) => {
  const { bitcoinAddress: rawAddress, attestationResponse, challenge: clientChallenge, linkToken } = req.body as {
    bitcoinAddress?: string;
    attestationResponse?: RegistrationResponseJSON;
    challenge?: string;
    linkToken?: string;
  };

  // If a linkToken was provided, derive the accountId from its commitment.
  // This is the "eval" step — applying the second fingerprint to the partial
  // function produces a deterministic address bound to Account A's commitment.
  let linkedCommitment: string | undefined;
  let linkedLinkRecord: typeof webauthnLinksTable.$inferSelect | undefined;

  let bitcoinAddress = rawAddress;

  if (linkToken) {
    const commitment = sha256(linkToken);
    const links = await db
      .select()
      .from(webauthnLinksTable)
      .where(eq(webauthnLinksTable.commitment, commitment))
      .limit(1);

    if (links.length === 0 || links[0].status !== "pending") {
      res.status(400).json({ error: "INVALID_LINK", message: "Link token is invalid, already used, or expired" });
      return;
    }
    if (new Date() > links[0].expiresAt) {
      res.status(400).json({ error: "LINK_EXPIRED", message: "Link token has expired" });
      return;
    }

    linkedCommitment = commitment;
    linkedLinkRecord = links[0];
    // Derived vault ID — deterministic from the commitment, anonymous to Account A.
    bitcoinAddress = `vault-linked-${commitment.slice(0, 16)}`;
  }

  if (!bitcoinAddress || !attestationResponse) {
    res.status(400).json({ error: "MISSING_FIELDS", message: "bitcoinAddress and attestationResponse are required" });
    return;
  }

  let expectedChallenge: string;

  if (clientChallenge) {
    // Client-generated challenge: biometric was prompted before any server interaction
    expectedChallenge = clientChallenge;
  } else {
    // Server-generated challenge: look up from DB (legacy flow)
    const challenges = await db
      .select()
      .from(webauthnChallengesTable)
      .where(eq(webauthnChallengesTable.bitcoinAddress, bitcoinAddress))
      .limit(1);

    if (challenges.length === 0) {
      res.status(400).json({ error: "NO_CHALLENGE", message: "No active registration challenge found" });
      return;
    }
    expectedChallenge = challenges[0].challenge;
    // Clean up server-side challenge
    await db
      .delete(webauthnChallengesTable)
      .where(eq(webauthnChallengesTable.id, challenges[0].id));
  }

  const { rpID, origin } = getRelyingParty(req.hostname);

  let verification;
  try {
    const opts: VerifyRegistrationResponseOpts = {
      response: attestationResponse,
      expectedChallenge,
      expectedOrigin: [origin, `http://${req.hostname}`],
      expectedRPID: rpID,
      requireUserVerification: true,
    };
    verification = await verifyRegistrationResponse(opts);
  } catch (err) {
    req.log.warn({ err }, "Registration verification failed");
    res.status(400).json({ error: "VERIFICATION_FAILED", message: "Biometric verification failed or attestation is invalid" });
    return;
  }

  if (!verification.verified || !verification.registrationInfo) {
    res.status(400).json({ error: "NOT_VERIFIED", message: "Registration could not be verified" });
    return;
  }

  const { credential } = verification.registrationInfo;

  // Persist credential (public key stored as base64)
  await db.insert(webauthnCredentialsTable).values({
    bitcoinAddress: bitcoinAddress!,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64"),
    signCount: credential.counter,
    linkedCommitment: linkedCommitment ?? null,
  });

  // If this is Account B, establish the link and stamp Account A with the same
  // commitment so both sides durably reference each other anonymously.
  if (linkedLinkRecord) {
    await db
      .update(webauthnLinksTable)
      .set({ linkedCredentialId: credential.id, status: "established" })
      .where(eq(webauthnLinksTable.id, linkedLinkRecord.id));

    await db
      .update(webauthnCredentialsTable)
      .set({ linkedCommitment: linkedLinkRecord.commitment })
      .where(eq(webauthnCredentialsTable.credentialId, linkedLinkRecord.originatorCredentialId));
  }

  res.json({
    success: true,
    credentialId: credential.id,
    bitcoinAddress: bitcoinAddress!,
    registeredAt: new Date().toISOString(),
    message: "Bitcoin address successfully bound to biometric credential",
  });
});

// POST /api/webauthn/authenticate/begin
router.post("/webauthn/authenticate/begin", async (req, res) => {
  const { bitcoinAddress } = req.body as { bitcoinAddress?: string };

  if (!bitcoinAddress) {
    res.status(400).json({ error: "MISSING_ADDRESS", message: "bitcoinAddress is required" });
    return;
  }

  const credentials = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.bitcoinAddress, bitcoinAddress))
    .limit(1);

  if (credentials.length === 0) {
    res.status(404).json({ error: "NOT_REGISTERED", message: "No biometric credential found for this Bitcoin address" });
    return;
  }

  const cred = credentials[0];
  const { rpID } = getRelyingParty(req.hostname);

  // Embed the Bitcoin address into the challenge for binding
  const challengePayload = JSON.stringify({
    purpose: "Prove Bitcoin Account Issuance",
    targetAccount: bitcoinAddress,
    nonce: Date.now().toString(36),
  });

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: [
      {
        id: cred.credentialId,
      },
    ],
    challenge: new TextEncoder().encode(challengePayload),
    timeout: 60000,
  });

  // Store challenge
  await db.insert(webauthnChallengesTable).values({
    challenge: options.challenge,
    bitcoinAddress,
    type: "authentication",
  });

  res.json(options);
});

// POST /api/webauthn/authenticate/complete
router.post("/webauthn/authenticate/complete", async (req, res) => {
  const { bitcoinAddress, assertionResponse } = req.body as {
    bitcoinAddress?: string;
    assertionResponse?: AuthenticationResponseJSON;
  };

  if (!bitcoinAddress || !assertionResponse) {
    res.status(400).json({ error: "MISSING_FIELDS", message: "bitcoinAddress and assertionResponse are required" });
    return;
  }

  // Fetch stored challenge
  const challenges = await db
    .select()
    .from(webauthnChallengesTable)
    .where(eq(webauthnChallengesTable.bitcoinAddress, bitcoinAddress))
    .limit(1);

  if (challenges.length === 0) {
    res.status(400).json({ error: "NO_CHALLENGE", message: "No active authentication challenge — call /authenticate/begin first" });
    return;
  }

  const storedChallenge = challenges[0];

  // Fetch stored credential
  const credentials = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.bitcoinAddress, bitcoinAddress))
    .limit(1);

  if (credentials.length === 0) {
    res.status(404).json({ error: "NOT_REGISTERED", message: "No credential registered for this address" });
    return;
  }

  const storedCred = credentials[0];
  const { rpID, origin } = getRelyingParty(req.hostname);

  let verification;
  try {
    const opts: VerifyAuthenticationResponseOpts = {
      response: assertionResponse,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: [origin, `http://${req.hostname}`],
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: storedCred.credentialId,
        publicKey: new Uint8Array(Buffer.from(storedCred.publicKey, "base64")),
        counter: storedCred.signCount,
      },
    };
    verification = await verifyAuthenticationResponse(opts);
  } catch (err) {
    req.log.warn({ err }, "Authentication verification failed");
    res.status(400).json({ error: "VERIFICATION_FAILED", message: "Biometric verification failed or signature is invalid" });
    return;
  }

  // Clean up challenge
  await db
    .delete(webauthnChallengesTable)
    .where(eq(webauthnChallengesTable.id, storedChallenge.id));

  if (!verification.verified) {
    res.status(400).json({ error: "NOT_VERIFIED", message: "Assertion could not be verified" });
    return;
  }

  const { authenticationInfo } = verification;

  // Update sign count and last used
  await db
    .update(webauthnCredentialsTable)
    .set({
      signCount: authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    })
    .where(eq(webauthnCredentialsTable.bitcoinAddress, bitcoinAddress));

  res.json({
    success: true,
    bitcoinAddress,
    credentialId: storedCred.credentialId,
    provenAt: new Date().toISOString(),
    message: "Ownership proven — cryptographic signature verified against bound credential",
    newSignCount: authenticationInfo.newCounter,
  });
});

// GET /api/webauthn/credentials
router.get("/webauthn/credentials", async (_req, res) => {
  const credentials = await db
    .select()
    .from(webauthnCredentialsTable)
    .orderBy(webauthnCredentialsTable.registeredAt);

  res.json({
    credentials: credentials.map((c) => ({
      id: c.id,
      bitcoinAddress: c.bitcoinAddress,
      credentialId: c.credentialId,
      registeredAt: c.registeredAt.toISOString(),
      lastUsedAt: c.lastUsedAt ? c.lastUsedAt.toISOString() : null,
      signCount: c.signCount,
      linkedCommitment: c.linkedCommitment ?? null,
    })),
    total: credentials.length,
  });
});

// POST /api/webauthn/link/generate
// Account A calls this to produce a one-time link token — the "apply" step.
// The token is a partially applied function: share it with Account B, whose
// fingerprint scan ("eval") completes the application into a bound address.
router.post("/webauthn/link/generate", async (req, res) => {
  const { bitcoinAddress } = req.body as { bitcoinAddress?: string };

  if (!bitcoinAddress) {
    res.status(400).json({ error: "MISSING_ADDRESS", message: "bitcoinAddress is required" });
    return;
  }

  const cred = await db
    .select()
    .from(webauthnCredentialsTable)
    .where(eq(webauthnCredentialsTable.bitcoinAddress, bitcoinAddress))
    .limit(1);

  if (cred.length === 0) {
    res.status(404).json({ error: "NOT_FOUND", message: "Account not found" });
    return;
  }

  // linkToken = credentialId + random nonce — unpredictable, one-time use.
  const nonce = randomBytes(16).toString("hex");
  const linkToken = `${cred[0].credentialId}:${nonce}`;
  const commitment = sha256(linkToken);
  const derivedAccountId = `vault-linked-${commitment.slice(0, 16)}`;

  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await db.insert(webauthnLinksTable).values({
    linkToken,
    commitment,
    originatorCredentialId: cred[0].credentialId,
    status: "pending",
    expiresAt,
  });

  res.json({
    linkToken,
    commitment,
    derivedAccountId,
    expiresAt: expiresAt.toISOString(),
  });
});

export default router;
