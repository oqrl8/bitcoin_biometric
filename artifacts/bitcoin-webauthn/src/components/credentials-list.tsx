import { useState } from "react";
import {
  useListCredentials,
  getListCredentialsQueryKey,
  useBeginAuthentication,
  useCompleteAuthentication,
  useGenerateLink,
} from "@workspace/api-client-react";
import { useFingerprint } from "@/hooks/use-fingerprint";
import { formatCredentialId } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Fingerprint, Loader2, ShieldCheck, ShieldAlert,
  AlertCircle, RefreshCcw, Link2, Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ProofBundle {
  clientDataJSONSnippet: string;
  signatureSnippet: string;
  signCount: number;
}

interface LinkBundle {
  linkToken: string;
  commitment: string;
  derivedAccountId: string;
  expiresAt: string;
}

type CredRow = {
  id: number;
  bitcoinAddress: string;
  credentialId: string;
  registeredAt: string;
  lastUsedAt?: string | null;
  signCount: number;
  linkedCommitment?: string | null;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-1 text-muted-foreground hover:text-primary transition-colors">
      {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

function AccountRow({ cred }: { cred: CredRow }) {
  const [proof, setProof] = useState<ProofBundle | null>(null);
  const [link, setLink] = useState<LinkBundle | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const queryClient = useQueryClient();
  const fp = useFingerprint();
  const beginAuth = useBeginAuthentication();
  const completeAuth = useCompleteAuthentication();
  const generateLink = useGenerateLink();

  const handleVerify = async () => {
    setLink(null);
    const options = await beginAuth.mutateAsync({ data: { bitcoinAddress: cred.bitcoinAddress } });
    const assertion = await fp.verify(cred.credentialId, options.challenge);
    if (!assertion) return;

    setIsCompleting(true);
    try {
      const result = await completeAuth.mutateAsync({
        data: {
          bitcoinAddress: cred.bitcoinAddress,
          assertionResponse: {
            id: assertion.id,
            rawId: assertion.rawId,
            type: assertion.type,
            response: assertion.response,
          },
        },
      });
      if (result.success) {
        setProof({
          clientDataJSONSnippet: assertion.response.clientDataJSON.slice(0, 32) + "...",
          signatureSnippet: assertion.response.signature.slice(0, 48) + "...",
          signCount: result.newSignCount ?? 0,
        });
        queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const handleGenerateLink = async () => {
    setProof(null);
    const result = await generateLink.mutateAsync({
      data: { bitcoinAddress: cred.bitcoinAddress },
    });
    setLink(result);
  };

  const scanning = fp.status === "scanning";
  const busy = beginAuth.isPending || scanning || isCompleting || generateLink.isPending;
  const isLinked = !!cred.linkedCommitment;

  return (
    <div className="border border-border/50 bg-card/40 overflow-hidden">

      {/* Account header */}
      <div className="flex items-center justify-between px-4 py-3 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isLinked ? "bg-primary/20 border border-primary/50" : "bg-primary/10 border border-primary/30"}`}>
            {isLinked
              ? <Link2 className="w-4 h-4 text-primary" />
              : <ShieldCheck className="w-4 h-4 text-primary" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-primary truncate">{formatCredentialId(cred.credentialId)}</p>
              {isLinked && (
                <Badge variant="outline" className="font-mono text-[9px] bg-primary/5 border-primary/30 text-primary px-1.5 py-0">
                  Contingent
                </Badge>
              )}
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Created {new Date(cred.registeredAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <Badge variant="outline" className="font-mono text-[10px] bg-background hidden sm:flex">
            <RefreshCcw className="w-2.5 h-2.5 mr-1" />{cred.signCount}
          </Badge>

          {/* Generate Link button */}
          {!proof && (
            generateLink.isPending ? (
              <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground hover:text-primary h-7 px-2"
                onClick={handleGenerateLink}
                disabled={busy}
                title="Generate a contingent link token (apply)"
              >
                <Link2 className="w-3 h-3 mr-1" /> Link
              </Button>
            )
          )}

          {/* Verify button */}
          {proof ? (
            <Button
              size="sm"
              variant="ghost"
              className="font-mono uppercase text-[10px] tracking-wider text-primary h-7 px-3"
              onClick={() => { setProof(null); fp.reset(); }}
            >
              <ShieldAlert className="w-3 h-3 mr-1.5" /> Verified
            </Button>
          ) : beginAuth.isPending ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Preparing...
            </span>
          ) : scanning ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-primary animate-pulse">
              <Fingerprint className="w-3 h-3" /> Scan Now
            </span>
          ) : isCompleting ? (
            <span className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Verifying...
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="font-mono uppercase text-[10px] tracking-wider border-border/50 hover:border-primary/50 hover:bg-primary/5 h-7 px-3"
              onClick={handleVerify}
              disabled={busy}
            >
              <Fingerprint className="w-3 h-3 mr-1.5" /> Verify
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {fp.status === "error" && fp.error && (
        <div className="px-4 pb-3 flex items-start gap-2 text-destructive text-[10px] font-mono">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          <span>{fp.error}</span>
        </div>
      )}

      {/* Linked commitment badge */}
      {isLinked && !proof && !link && (
        <div className="border-t border-primary/10 bg-primary/5 px-4 py-2 font-mono text-[9px] flex items-center gap-2">
          <Link2 className="w-3 h-3 text-primary/50 shrink-0" />
          <span className="text-primary/60">Commitment: </span>
          <span className="text-primary/80 break-all">{cred.linkedCommitment!.slice(0, 24)}...</span>
        </div>
      )}

      {/* Link token panel — the "apply" output */}
      {link && (
        <div className="border-t border-primary/30 bg-primary/5 px-4 py-3 font-mono text-[10px] space-y-3">
          <div className="uppercase tracking-widest text-primary/60 text-[9px] mb-1">
            Link Token Generated — share with Account B
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground text-[9px]">APPLY (token)</span>
            <div className="flex items-start gap-1 bg-black/40 px-2 py-1.5 border border-primary/20">
              <span className="text-primary break-all flex-1">{link.linkToken.slice(0, 48)}...</span>
              <CopyButton text={link.linkToken} />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground text-[9px]">COMMITMENT sha256(token)</span>
            <div className="flex items-start gap-1 bg-black/40 px-2 py-1.5 border border-border/30">
              <span className="text-foreground/60 break-all flex-1">{link.commitment.slice(0, 32)}...</span>
              <CopyButton text={link.commitment} />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-muted-foreground text-[9px]">EVAL RESULT — derived account B address</span>
            <div className="flex items-center gap-1 bg-black/40 px-2 py-1.5 border border-border/30">
              <span className="text-primary/70 flex-1">{link.derivedAccountId}</span>
              <CopyButton text={link.derivedAccountId} />
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-muted-foreground pt-1 border-t border-border/30">
            <span>Expires: {new Date(link.expiresAt).toLocaleTimeString()}</span>
            <button onClick={() => setLink(null)} className="text-muted-foreground hover:text-foreground">Dismiss</button>
          </div>
        </div>
      )}

      {/* Proof bundle — the "eval" output */}
      {proof && (
        <div className="border-t border-border/50 bg-black/30 px-4 py-3 font-mono text-[10px] space-y-2">
          <div className="uppercase tracking-widest text-muted-foreground text-[9px] mb-2">Cryptographic Proof</div>
          <div className="flex gap-2">
            <span className="text-primary/60 shrink-0">DATA:</span>
            <span className="text-foreground/80 break-all">{proof.clientDataJSONSnippet}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary/60 shrink-0">SIG:</span>
            <span className="text-primary break-all">{proof.signatureSnippet}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-primary/60 shrink-0">CTR:</span>
            <span className="text-foreground/80">{proof.signCount} (replay protection)</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CredentialsList() {
  const { data, isLoading, error } = useListCredentials({
    query: { queryKey: getListCredentialsQueryKey() },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full bg-muted/40" />
        <Skeleton className="h-14 w-full bg-muted/40" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-destructive/50 bg-destructive/10 text-destructive text-xs font-mono">
        Failed to load accounts.
      </div>
    );
  }

  if (!data?.credentials?.length) {
    return (
      <div className="py-10 border border-dashed border-border/40 text-center flex flex-col items-center gap-3 text-muted-foreground">
        <Fingerprint className="w-8 h-8 opacity-30" />
        <p className="text-xs font-mono">No accounts yet.</p>
        <p className="text-[10px] font-mono opacity-60">Scan your fingerprint above to create one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.credentials.map((cred) => (
        <AccountRow key={cred.id} cred={cred} />
      ))}
    </div>
  );
}
