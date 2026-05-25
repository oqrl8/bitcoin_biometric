/**
 * Mock registration route — accepts synthetic P-256 public keys generated
 * by SubtleCrypto client-side and stores them without WebAuthn attestation
 * verification. This lets the apply→eval message stream be simulated
 * node-to-node without physical biometric hardware.
 */
import { Router } from "express";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, webauthnCredentialsTable, webauthnLinksTable } from "@workspace/db";

const router = Router();

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

router.post("/mock/register", async (req, res) => {
  const { credentialId, publicKeySpki, linkToken } = req.body as {
    credentialId?: string;
    publicKeySpki?: string;
    linkToken?: string;
  };

  if (!credentialId || !publicKeySpki) {
    res.status(400).json({ error: "MISSING_FIELDS", message: "credentialId and publicKeySpki are required" });
    return;
  }

  // Resolve link if provided — this is the eval step (Node B)
  let linkedCommitment: string | null = null;
  let linkedLinkRecord: typeof webauthnLinksTable.$inferSelect | undefined;
  let vaultId: string;

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
    // Derived vault ID — deterministic from the commitment, anonymous to Node A
    vaultId = `vault-linked-${commitment.slice(0, 16)}`;
  } else {
    vaultId = `vault-mock-${credentialId.slice(0, 12)}`;
  }

  // Store the synthetic credential (publicKey as the SPKI base64 directly)
  await db.insert(webauthnCredentialsTable).values({
    bitcoinAddress: vaultId,
    credentialId,
    publicKey: publicKeySpki,
    signCount: 0,
    linkedCommitment,
  });

  // If Node B — establish link and stamp Node A's record with the commitment
  if (linkedLinkRecord) {
    await db
      .update(webauthnLinksTable)
      .set({ linkedCredentialId: credentialId, status: "established" })
      .where(eq(webauthnLinksTable.id, linkedLinkRecord.id));

    await db
      .update(webauthnCredentialsTable)
      .set({ linkedCommitment: linkedLinkRecord.commitment })
      .where(eq(webauthnCredentialsTable.credentialId, linkedLinkRecord.originatorCredentialId));
  }

  res.json({
    vaultId,
    credentialId,
    linkedCommitment,
    message: linkToken
      ? "Node B created — eval(apply(credA)) resolved to derived address"
      : "Node A created — mock credential stored, ready for apply",
  });
});

export default router;
