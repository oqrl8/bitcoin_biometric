/**
 * useMockStream — simulates the apply→eval message stream entirely in the
 * browser. Each "fingerprint scan" is replaced by SubtleCrypto generating a
 * real P-256 keypair locally. The server mock endpoint accepts the synthetic
 * public key without WebAuthn attestation, stores it, and links the two
 * accounts exactly as the hardware path would.
 *
 * Graph structure:
 *
 *        [COMMITMENT ROOT]
 *           /          \
 *      [Node A]      [Node B]
 *      origin        derived
 *     apply →       ← eval
 *
 * This is a doubly-linked pair: A → (apply) → token → (eval) → B,
 * and the commitment is the Merkle root both leaves hash to.
 */

import { useState, useCallback } from "react";

export type NodeStatus = "idle" | "keygen" | "apply" | "transit" | "eval" | "done" | "error";

export interface StreamNodeState {
  label: string;
  role: "origin" | "destination";
  status: NodeStatus;
  vaultId?: string;
  credentialId?: string;
  publicKeySnippet?: string;
  message?: string;
}

export interface StreamState {
  nodeA: StreamNodeState;
  nodeB: StreamNodeState;
  commitment?: string;
  derivedAccountId?: string;
  linkToken?: string;
  activeEdge?: "apply" | "eval" | null;
  phase: "idle" | "a-done" | "b-done" | "error";
  error?: string;
}

const INIT: StreamState = {
  nodeA: { label: "Node A", role: "origin", status: "idle" },
  nodeB: { label: "Node B", role: "destination", status: "idle" },
  activeEdge: null,
  phase: "idle",
};

/** Generate a real P-256 keypair via SubtleCrypto and export the public key */
async function genKeyPair(): Promise<{ credentialId: string; spkiBase64: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const spkiBase64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  const credentialId = crypto.randomUUID().replace(/-/g, "");
  return { credentialId, spkiBase64 };
}

export function useMockStream() {
  const [state, setState] = useState<StreamState>(INIT);

  const patch = useCallback((delta: Partial<StreamState>) => {
    setState((s) => ({ ...s, ...delta }));
  }, []);

  const patchA = useCallback((delta: Partial<StreamNodeState>) => {
    setState((s) => ({ ...s, nodeA: { ...s.nodeA, ...delta } }));
  }, []);

  const patchB = useCallback((delta: Partial<StreamNodeState>) => {
    setState((s) => ({ ...s, nodeB: { ...s.nodeB, ...delta } }));
  }, []);

  /** Step 1: Node A scans (mock) → emits apply */
  const fireNodeA = useCallback(async () => {
    patchA({ status: "keygen", message: "Generating P-256 keypair..." });
    await delay(400);

    let credentialId: string, spkiBase64: string;
    try {
      ({ credentialId, spkiBase64 } = await genKeyPair());
    } catch {
      patchA({ status: "error", message: "SubtleCrypto failed" });
      return;
    }

    patchA({
      status: "apply",
      credentialId,
      publicKeySnippet: spkiBase64.slice(0, 24) + "…",
      message: "Calling mock/register → generating link token…",
    });

    await delay(300);

    // Register Node A with the server
    let regA: { vaultId: string; credentialId: string };
    try {
      const res = await fetch("/api/webauthn/mock/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId, publicKeySpki: spkiBase64 }),
      });
      if (!res.ok) throw new Error(await res.text());
      regA = await res.json();
    } catch (e) {
      patchA({ status: "error", message: String(e) });
      patch({ phase: "error", error: String(e) });
      return;
    }

    // Generate the link token (apply — partial function)
    let linkResult: { linkToken: string; commitment: string; derivedAccountId: string; expiresAt: string };
    try {
      const res = await fetch("/api/webauthn/link/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bitcoinAddress: regA.vaultId }),
      });
      if (!res.ok) throw new Error(await res.text());
      linkResult = await res.json();
    } catch (e) {
      patchA({ status: "error", message: String(e) });
      patch({ phase: "error", error: String(e) });
      return;
    }

    patchA({
      status: "done",
      vaultId: regA.vaultId,
      message: `apply(credA) → token emitted`,
    });

    patch({
      linkToken: linkResult.linkToken,
      commitment: linkResult.commitment,
      derivedAccountId: linkResult.derivedAccountId,
      activeEdge: "apply",
      phase: "a-done",
    });

    await delay(600);
    patch({ activeEdge: null });
    patchB({ status: "idle", message: "Token received. Awaiting eval…" });
  }, [patch, patchA, patchB]);

  /** Step 2: Node B scans (mock) → applies eval to the token → stores result */
  const fireNodeB = useCallback(async () => {
    if (state.phase !== "a-done" || !state.linkToken) return;

    patchB({ status: "keygen", message: "Generating P-256 keypair…" });
    await delay(400);

    let credentialId: string, spkiBase64: string;
    try {
      ({ credentialId, spkiBase64 } = await genKeyPair());
    } catch {
      patchB({ status: "error", message: "SubtleCrypto failed" });
      return;
    }

    patchB({
      status: "eval",
      credentialId,
      publicKeySnippet: spkiBase64.slice(0, 24) + "…",
      message: "eval(token, credB) → resolving address…",
    });

    patch({ activeEdge: "eval" });
    await delay(500);
    patch({ activeEdge: null });

    // Register Node B using the link token (eval step)
    let regB: { vaultId: string; credentialId: string };
    try {
      const res = await fetch("/api/webauthn/mock/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credentialId,
          publicKeySpki: spkiBase64,
          linkToken: state.linkToken,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      regB = await res.json();
    } catch (e) {
      patchB({ status: "error", message: String(e) });
      patch({ phase: "error", error: String(e) });
      return;
    }

    patchB({
      status: "done",
      vaultId: regB.vaultId,
      message: `eval resolved → ${regB.vaultId}`,
    });

    patch({ phase: "b-done" });
  }, [state.phase, state.linkToken, patch, patchB]);

  const reset = useCallback(() => setState(INIT), []);

  return { state, fireNodeA, fireNodeB, reset };
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
