import { useState } from "react";
import { useCompleteRegistration, getListCredentialsQueryKey } from "@workspace/api-client-react";
import { useFingerprint } from "@/hooks/use-fingerprint";
import { useQueryClient } from "@tanstack/react-query";
import { Fingerprint, Loader2, CheckCircle2, AlertCircle, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "new" | "linked";

export function RegisterPanel() {
  const [mode, setMode] = useState<Mode>("new");
  const [linkToken, setLinkToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [credentialId, setCredentialId] = useState("");
  const [commitment, setCommitment] = useState("");
  const [isBinding, setIsBinding] = useState(false);

  const queryClient = useQueryClient();
  const fp = useFingerprint();
  const completeReg = useCompleteRegistration();

  const handleRegister = async () => {
    // Biometric fires immediately — no server call first.
    const result = await fp.register();
    if (!result) return;

    setIsBinding(true);
    try {
      const bound = await completeReg.mutateAsync({
        data: {
          // In linked mode the server derives the accountId from the token —
          // pass a placeholder; the route ignores it when linkToken is present.
          bitcoinAddress: mode === "linked" ? "pending" : result.accountId,
          challenge: result.challenge,
          linkToken: mode === "linked" ? linkToken.trim() : undefined,
          attestationResponse: {
            id: result.id,
            rawId: result.rawId,
            type: result.type,
            response: result.response,
          },
        },
      });

      if (bound.success) {
        setAccountId(bound.bitcoinAddress);
        setCredentialId(bound.credentialId);
        queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
      }
    } finally {
      setIsBinding(false);
    }
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (accountId) {
    return (
      <div className="flex flex-col items-center gap-5 py-4 w-full">
        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-primary" />
        </div>

        <p className="font-display uppercase tracking-widest text-sm text-primary">
          {mode === "linked" ? "Contingent Account Created" : "Account Created"}
        </p>

        <div className="w-full space-y-2 font-mono text-[10px]">
          <div className="bg-black/40 border border-border/50 px-3 py-2 space-y-1">
            <p className="uppercase tracking-widest text-muted-foreground text-[9px]">Account ID</p>
            <p className="text-foreground break-all">{accountId}</p>
          </div>
          <div className="bg-black/40 border border-border/50 px-3 py-2 space-y-1">
            <p className="uppercase tracking-widest text-muted-foreground text-[9px]">Credential ID</p>
            <p className="text-primary break-all">{credentialId}</p>
          </div>
          {commitment && (
            <div className="bg-black/40 border border-primary/20 px-3 py-2 space-y-1">
              <p className="uppercase tracking-widest text-primary/60 text-[9px]">Shared Commitment</p>
              <p className="text-primary/80 break-all">{commitment.slice(0, 32)}...</p>
              <p className="text-[8px] text-muted-foreground">Both accounts share this commitment anonymously</p>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="font-mono uppercase text-xs border-border/50 hover:border-primary/50"
          onClick={() => { setAccountId(""); setCredentialId(""); setCommitment(""); setLinkToken(""); setMode("new"); fp.reset(); }}
        >
          Create Another
        </Button>
      </div>
    );
  }

  const scanning = fp.status === "scanning";
  const busy = scanning || isBinding;
  const canScan = mode === "new" || (mode === "linked" && linkToken.trim().length > 0);

  // ── Idle / scanning state ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center gap-5 py-4 w-full">

      {/* Mode toggle */}
      <div className="flex gap-0 border border-border/50 w-full">
        <button
          onClick={() => setMode("new")}
          className={`flex-1 py-1.5 font-mono uppercase text-[10px] tracking-widest transition-colors ${mode === "new" ? "bg-primary/10 text-primary border-r border-border/50" : "text-muted-foreground hover:text-foreground border-r border-border/50"}`}
        >
          New Account
        </button>
        <button
          onClick={() => setMode("linked")}
          className={`flex-1 py-1.5 font-mono uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-1.5 ${mode === "linked" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Link2 className="w-3 h-3" /> Join Link
        </button>
      </div>

      {/* Link token input */}
      {mode === "linked" && (
        <div className="w-full space-y-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Paste link token from Account A
          </p>
          <Input
            className="font-mono text-xs bg-input/30 border-border/50 h-8"
            placeholder="Paste link token..."
            value={linkToken}
            onChange={(e) => setLinkToken(e.target.value)}
            disabled={busy}
          />
          {linkToken.trim() && (
            <p className="font-mono text-[9px] text-primary/60">
              Derived ID: vault-linked-{linkToken.trim().length > 0 ? "..." : ""}
            </p>
          )}
        </div>
      )}

      {/* Fingerprint button */}
      <button
        onClick={handleRegister}
        disabled={busy || !canScan}
        className="group relative w-28 h-28 rounded-full border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {isBinding ? (
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        ) : scanning ? (
          <Fingerprint className="w-13 h-13 text-primary animate-pulse" />
        ) : (
          <Fingerprint className="w-13 h-13 text-primary group-hover:scale-110 transition-transform duration-200" />
        )}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary/30 group-hover:bg-primary/60 transition-colors" />
      </button>

      <div className="text-center space-y-1 min-h-[2.5rem]">
        {scanning && (
          <>
            <p className="font-display uppercase tracking-widest text-sm text-primary animate-pulse">Waiting for Fingerprint</p>
            <p className="font-mono text-xs text-muted-foreground">Place your finger on the sensor</p>
          </>
        )}
        {isBinding && (
          <>
            <p className="font-display uppercase tracking-widest text-sm">Binding Account...</p>
            <p className="font-mono text-xs text-muted-foreground">Verifying cryptographic proof</p>
          </>
        )}
        {!busy && fp.status !== "error" && (
          <>
            <p className="font-display uppercase tracking-widest text-sm">
              {mode === "linked" ? "Scan to Complete Link" : "Scan to Create Account"}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {mode === "linked" ? "Your fingerprint evaluates the link" : "Touch the sensor when prompted"}
            </p>
          </>
        )}
        {fp.status === "error" && fp.error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono max-w-xs">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{fp.error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
