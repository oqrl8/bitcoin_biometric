import { useState, useCallback } from "react";

// ── inline base64url helpers (no external deps) ──────────────────────────────

function toBuffer(b64url: string): ArrayBuffer {
  const base64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  // Cast to ArrayBuffer — the Uint8Array was allocated from a plain heap
  // buffer, never a SharedArrayBuffer, satisfying the WebAuthn BufferSource type.
  return out.buffer as ArrayBuffer;
}

function toBase64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── public types ──────────────────────────────────────────────────────────────

export interface RegisterResult {
  /** Opaque account identifier generated for this credential. */
  accountId: string;
  /** Challenge that was signed — send this to the server alongside the attestation. */
  challenge: string;
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
}

export interface VerifyResult {
  id: string;
  rawId: string;
  type: string;
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };
}

export type FingerprintStatus = "idle" | "scanning" | "error";

export interface UseFingerprintReturn {
  status: FingerprintStatus;
  error: string | null;
  /**
   * Create a new biometric credential. Generates its own accountId and
   * challenge client-side — no server round-trip before the scan.
   */
  register: () => Promise<RegisterResult | null>;
  /**
   * Assert an existing credential. Pass the server-issued challenge
   * (base64url) and the stored credentialId.
   */
  verify: (credentialId: string, serverChallenge: string) => Promise<VerifyResult | null>;
  reset: () => void;
}

// ── hook ──────────────────────────────────────────────────────────────────────

export function useFingerprint(): UseFingerprintReturn {
  const [status, setStatus] = useState<FingerprintStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  const register = useCallback(async (): Promise<RegisterResult | null> => {
    setStatus("scanning");
    setError(null);

    const accountId = `vault-${crypto.randomUUID()}`;
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32));

    try {
      const raw = await navigator.credentials.create({
        publicKey: {
          challenge: challengeBytes,
          rp: { name: "Sovereign Vault", id: window.location.hostname },
          user: {
            id: new TextEncoder().encode(accountId),
            name: accountId,
            displayName: "Sovereign Vault Account",
          },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "required",
          },
          attestation: "none",
          timeout: 60_000,
        },
      });

      if (!raw) throw new Error("Authenticator returned no credential");

      const cred = raw as PublicKeyCredential;
      const resp = cred.response as AuthenticatorAttestationResponse;

      setStatus("idle");
      return {
        accountId,
        challenge: toBase64url(challengeBytes),
        id: cred.id,
        rawId: toBase64url(cred.rawId),
        type: cred.type,
        response: {
          clientDataJSON: toBase64url(resp.clientDataJSON),
          attestationObject: toBase64url(resp.attestationObject),
        },
      };
    } catch (err: any) {
      setStatus("error");
      setError(err.message ?? "Biometric scan failed or was cancelled");
      return null;
    }
  }, []);

  const verify = useCallback(
    async (credentialId: string, serverChallenge: string): Promise<VerifyResult | null> => {
      setStatus("scanning");
      setError(null);

      try {
        const raw = await navigator.credentials.get({
          publicKey: {
            challenge: toBuffer(serverChallenge),
            allowCredentials: [{ id: toBuffer(credentialId), type: "public-key" as const }],
            userVerification: "required",
            rpId: window.location.hostname,
            timeout: 60_000,
          },
        });

        if (!raw) throw new Error("Authenticator returned no assertion");

        const assertion = raw as PublicKeyCredential;
        const resp = assertion.response as AuthenticatorAssertionResponse;

        setStatus("idle");
        return {
          id: assertion.id,
          rawId: toBase64url(assertion.rawId),
          type: assertion.type,
          response: {
            clientDataJSON: toBase64url(resp.clientDataJSON),
            authenticatorData: toBase64url(resp.authenticatorData),
            signature: toBase64url(resp.signature),
            userHandle: resp.userHandle ? toBase64url(resp.userHandle) : undefined,
          },
        };
      } catch (err: any) {
        setStatus("error");
        setError(err.message ?? "Biometric scan failed or was cancelled");
        return null;
      }
    },
    [],
  );

  return { status, error, register, verify, reset };
}
