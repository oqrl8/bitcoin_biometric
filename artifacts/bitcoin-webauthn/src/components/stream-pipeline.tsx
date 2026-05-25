/**
 * StreamPipeline — visual simulation of the apply→eval message stream.
 *
 * Each box is a node. Node A fires "apply" (partial function application),
 * emitting a link token that travels to Node B. Node B fires "eval"
 * (completing the application), which resolves to a deterministic vault
 * address. The shared commitment hash is the Merkle root both leaf nodes
 * descend from — neither exposes the other's full identity.
 *
 *   ┌─────────┐   apply →   ┌─────────┐
 *   │ Node A  │ ──────────▶ │ Node B  │
 *   └─────────┘             └─────────┘
 *        │                       │
 *        └──────── ROOT ──────────┘
 *               commitment
 */

import { useQueryClient } from "@tanstack/react-query";
import { getListCredentialsQueryKey } from "@workspace/api-client-react";
import { useMockStream } from "@/hooks/use-mock-stream";
import { Fingerprint, ArrowRight, Loader2, CheckCircle2, AlertCircle, RotateCcw, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  idle: "IDLE",
  keygen: "KEYGEN",
  apply: "APPLY",
  transit: "TRANSIT",
  eval: "EVAL",
  done: "DONE",
  error: "ERROR",
};

const STATUS_COLOR: Record<string, string> = {
  idle: "text-muted-foreground",
  keygen: "text-yellow-500",
  apply: "text-primary",
  transit: "text-primary animate-pulse",
  eval: "text-primary",
  done: "text-green-500",
  error: "text-destructive",
};

function NodeBox({
  label,
  role,
  status,
  vaultId,
  credentialId,
  publicKeySnippet,
  message,
  onScan,
  scanLabel,
  disabled,
}: {
  label: string;
  role: "origin" | "destination";
  status: string;
  vaultId?: string;
  credentialId?: string;
  publicKeySnippet?: string;
  message?: string;
  onScan?: () => void;
  scanLabel: string;
  disabled?: boolean;
}) {
  const isDone = status === "done";
  const isError = status === "error";
  const isActive = ["keygen", "apply", "eval"].includes(status);

  return (
    <div
      className={cn(
        "flex-1 border bg-card/30 flex flex-col gap-3 p-4 transition-all duration-300 min-w-0",
        isDone ? "border-green-500/40 bg-green-500/5" : isError ? "border-destructive/40" : isActive ? "border-primary/50 bg-primary/5" : "border-border/50",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center border text-[9px] font-bold",
            isDone ? "border-green-500/60 bg-green-500/10 text-green-500" : isActive ? "border-primary/60 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground",
          )}>
            {role === "origin" ? "A" : "B"}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        </div>
        <span className={cn("font-mono text-[9px] uppercase tracking-widest", STATUS_COLOR[status] ?? "text-muted-foreground")}>
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* Scan button */}
      {!isDone && !isError && (
        <button
          onClick={onScan}
          disabled={disabled || isActive}
          className={cn(
            "group w-full py-4 border-2 rounded-none flex flex-col items-center gap-2 transition-all duration-200",
            isActive
              ? "border-primary/60 bg-primary/10 cursor-not-allowed"
              : disabled
              ? "border-border/20 opacity-30 cursor-not-allowed"
              : "border-border/40 hover:border-primary/60 hover:bg-primary/5 cursor-pointer",
          )}
        >
          {isActive ? (
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          ) : (
            <Fingerprint className={cn("w-8 h-8 transition-transform duration-200", !disabled && "group-hover:scale-110 text-primary/60 group-hover:text-primary")} />
          )}
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            {isActive ? (STATUS_LABEL[status]) : scanLabel}
          </span>
        </button>
      )}

      {/* Done state */}
      {isDone && (
        <div className="flex items-center gap-2 py-3 justify-center">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <span className="font-mono text-[10px] text-green-400">Bound</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-2 py-2">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <span className="font-mono text-[9px] text-destructive">{message}</span>
        </div>
      )}

      {/* Data fields */}
      <div className="space-y-1.5 font-mono text-[9px]">
        {message && !isError && (
          <div className="text-muted-foreground break-all leading-relaxed">{message}</div>
        )}
        {vaultId && (
          <div className="bg-black/30 px-2 py-1.5 space-y-0.5">
            <div className="text-muted-foreground/60 uppercase tracking-widest text-[8px]">Vault ID</div>
            <div className="text-primary break-all">{vaultId}</div>
          </div>
        )}
        {credentialId && (
          <div className="bg-black/30 px-2 py-1.5 space-y-0.5">
            <div className="text-muted-foreground/60 uppercase tracking-widest text-[8px]">Credential</div>
            <div className="text-foreground/60 break-all">{credentialId.slice(0, 24)}…</div>
          </div>
        )}
        {publicKeySnippet && (
          <div className="bg-black/30 px-2 py-1.5 space-y-0.5">
            <div className="text-muted-foreground/60 uppercase tracking-widest text-[8px]">P-256 PubKey</div>
            <div className="text-foreground/40 break-all">{publicKeySnippet}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function EdgeArrow({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 shrink-0 self-center">
      <span className={cn("font-mono text-[8px] uppercase tracking-widest", active ? "text-primary" : "text-muted-foreground/40")}>
        {label}
      </span>
      <ArrowRight
        className={cn("w-5 h-5 transition-all duration-300", active ? "text-primary animate-pulse scale-110" : "text-border/40")}
      />
    </div>
  );
}

function MerkleRoot({ commitment, derivedAccountId }: { commitment?: string; derivedAccountId?: string }) {
  if (!commitment) return null;
  return (
    <div className="border border-primary/20 bg-primary/5 px-4 py-3 space-y-3 font-mono text-[9px]">
      <div className="flex items-center gap-2">
        <Link2 className="w-3 h-3 text-primary/60 shrink-0" />
        <span className="uppercase tracking-widest text-primary/60">Merkle Commitment Root</span>
      </div>

      {/* Tree visual */}
      <div className="text-center space-y-1">
        <div className="inline-block bg-black/40 border border-primary/30 px-3 py-1.5">
          <span className="text-primary">ROOT</span>
          <span className="text-muted-foreground ml-2">{commitment.slice(0, 16)}…</span>
        </div>
        <div className="flex justify-center gap-16 text-muted-foreground/30 text-lg leading-none">
          {"/ \\"}
        </div>
        <div className="flex justify-center gap-4">
          <div className="bg-black/30 border border-border/30 px-2 py-1 text-[8px] text-muted-foreground">
            <div className="uppercase">Node A</div>
            <div className="text-primary/60">origin</div>
          </div>
          <div className="bg-black/30 border border-border/30 px-2 py-1 text-[8px] text-muted-foreground">
            <div className="uppercase">Node B</div>
            <div className="text-primary/60">derived</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border/30 pt-2">
        <div>
          <div className="text-muted-foreground/60 uppercase text-[8px] mb-0.5">sha256(linkToken)</div>
          <div className="text-foreground/60 break-all">{commitment}</div>
        </div>
        {derivedAccountId && (
          <div>
            <div className="text-muted-foreground/60 uppercase text-[8px] mb-0.5">eval result → address B</div>
            <div className="text-primary break-all">{derivedAccountId}</div>
          </div>
        )}
      </div>

      <p className="text-[8px] text-muted-foreground/50 border-t border-border/20 pt-2">
        Both leaves independently hash to this root. Neither reveals the other's vault ID — only the shared commitment proves the relationship.
      </p>
    </div>
  );
}

export function StreamPipeline() {
  const queryClient = useQueryClient();
  const { state, fireNodeA, fireNodeB, reset } = useMockStream();
  const { nodeA, nodeB, commitment, derivedAccountId, activeEdge, phase, error } = state;

  const handleNodeA = async () => {
    await fireNodeA();
    queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
  };

  const handleNodeB = async () => {
    await fireNodeB();
    queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/60">
            Mock stream — SubtleCrypto P-256 · no hardware required
          </p>
        </div>
        {phase !== "idle" && (
          <Button
            variant="ghost"
            size="sm"
            className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground h-7 px-2"
            onClick={() => { reset(); queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() }); }}
          >
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Node pipeline */}
      <div className="flex items-stretch gap-0">
        <NodeBox
          {...nodeA}
          scanLabel="Simulate A (apply)"
          onScan={handleNodeA}
          disabled={phase !== "idle"}
        />
        <EdgeArrow active={activeEdge === "apply"} label="apply →" />
        <NodeBox
          {...nodeB}
          scanLabel="Simulate B (eval)"
          onScan={handleNodeB}
          disabled={phase !== "a-done"}
        />
      </div>

      {/* Merkle root — appears once commit is known */}
      <MerkleRoot commitment={commitment} derivedAccountId={derivedAccountId} />

      {/* Global error */}
      {error && (
        <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[10px] text-destructive">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Completion banner */}
      {phase === "b-done" && (
        <div className="border border-green-500/30 bg-green-500/5 px-4 py-3 font-mono text-[10px] space-y-1">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="uppercase tracking-widest">Contingent pair established</span>
          </div>
          <p className="text-muted-foreground">
            Both nodes committed to the same Merkle root. Neither knows the other&apos;s vault ID — only the shared commitment proves the relationship on the network.
          </p>
        </div>
      )}
    </div>
  );
}
