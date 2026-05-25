import { useState } from "react";
import { useBeginAuthentication, useCompleteAuthentication, getListCredentialsQueryKey } from "@workspace/api-client-react";
import { base64urlToBuffer, bufferToBase64url } from "@/lib/webauthn";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, Loader2, Key, AlertCircle, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { formatCredentialId, formatBitcoinAddress } from "@/lib/format";

interface ProofBundle {
  credentialId: string;
  clientDataJSONSnippet: string;
  signatureSnippet: string;
  bitcoinAddress: string;
  signCount: number;
}

export function AuthenticatePanel({ initialAddress = "" }: { initialAddress?: string }) {
  const [address, setAddress] = useState(initialAddress);
  const [step, setStep] = useState<"idle" | "requesting" | "scanning" | "verifying" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [proof, setProof] = useState<ProofBundle | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const beginAuth = useBeginAuthentication();
  const completeAuth = useCompleteAuthentication();

  const handleAuthenticate = async () => {
    if (!address) return;
    
    try {
      setStep("requesting");
      setErrorMsg("");
      setProof(null);

      // 1. Begin Auth
      const options = await beginAuth.mutateAsync({ data: { bitcoinAddress: address } });
      
      setStep("scanning");

      // 2. Transform Options
      const publicKey = {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        allowCredentials: options.allowCredentials?.map(c => ({
          ...c,
          id: base64urlToBuffer(c.id as string)
        }))
      };

      // 3. Get Credential
      let assertion;
      try {
        assertion = await navigator.credentials.get({ publicKey: publicKey as any }) as PublicKeyCredential;
      } catch (err: any) {
        setStep("error");
        setErrorMsg(err.message || "Biometric scan failed or cancelled");
        return;
      }

      if (!assertion) {
        throw new Error("No assertion returned");
      }

      setStep("verifying");

      // 4. Transform Result
      const response = assertion.response as AuthenticatorAssertionResponse;
      
      const clientDataJSON = bufferToBase64url(response.clientDataJSON);
      const signature = bufferToBase64url(response.signature);
      
      const assertionResponse = {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: clientDataJSON,
          authenticatorData: bufferToBase64url(response.authenticatorData),
          signature: signature,
          userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined
        }
      };

      // 5. Complete Auth
      const result = await completeAuth.mutateAsync({ 
        data: { 
          bitcoinAddress: address, 
          assertionResponse 
        } 
      });

      if (result.success) {
        setStep("success");
        setProof({
          credentialId: result.credentialId,
          clientDataJSONSnippet: clientDataJSON.slice(0, 32) + "...",
          signatureSnippet: signature.slice(0, 48) + "...",
          bitcoinAddress: result.bitcoinAddress,
          signCount: result.newSignCount || 0
        });
        queryClient.invalidateQueries({ queryKey: getListCredentialsQueryKey() });
        toast({
          title: "Cryptographic Proof Generated",
          description: "Ownership of the Bitcoin address has been proven.",
        });
      } else {
        throw new Error(result.message || "Authentication failed");
      }

    } catch (err: any) {
      console.error(err);
      setStep("error");
      setErrorMsg(err.message || "An unexpected error occurred");
    }
  };

  return (
    <Card className="border-border bg-card shadow-xl overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-muted to-muted-foreground/30"></div>
      <CardHeader>
        <CardTitle className="font-display uppercase tracking-widest text-lg">II. Generate Proof</CardTitle>
        <CardDescription className="font-mono text-xs">Assert ownership of a registered Bitcoin address via biometric signature.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {step !== "success" && (
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Bitcoin Address</Label>
            <Input 
              className="font-mono bg-input/50 border-border" 
              placeholder="bc1q..." 
              value={address} 
              onChange={(e) => setAddress(e.target.value)}
              disabled={step !== "idle" && step !== "error"}
            />
          </div>
        )}

        {step === "error" && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm font-mono flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {step === "success" && proof && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="p-4 bg-muted/30 border border-border text-center">
              <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h3 className="font-display uppercase tracking-widest text-sm mb-1 text-primary">Assertion Valid</h3>
              <p className="font-mono text-xs text-muted-foreground break-all">{proof.bitcoinAddress}</p>
            </div>
            
            <div className="bg-black/50 p-4 border border-border font-mono text-[10px] space-y-3 overflow-x-auto">
              <div className="uppercase tracking-widest text-muted-foreground mb-2 text-[9px] border-b border-border/50 pb-1">Cryptographic Proof Bundle</div>
              
              <div>
                <span className="text-primary/70">Credential_ID:</span>
                <div className="text-foreground">{formatCredentialId(proof.credentialId)}</div>
              </div>
              
              <div>
                <span className="text-primary/70">Client_Data_Hash:</span>
                <div className="text-foreground text-muted-foreground break-all">{proof.clientDataJSONSnippet}</div>
              </div>
              
              <div>
                <span className="text-primary/70">ECDSA_Signature:</span>
                <div className="text-foreground break-all text-primary">{proof.signatureSnippet}</div>
              </div>
              
              <div>
                <span className="text-primary/70">Sign_Count:</span>
                <div className="text-foreground">{proof.signCount} (Replay Protection)</div>
              </div>
            </div>

            <Button variant="outline" className="w-full font-mono uppercase text-xs h-10 border-border hover:bg-muted" onClick={() => { setStep("idle"); setProof(null); }}>
              Acknowledge & Reset
            </Button>
          </div>
        )}
      </CardContent>

      {step !== "success" && (
        <CardFooter>
          <Button 
            variant="secondary"
            className="w-full font-mono uppercase tracking-widest rounded-none h-12 border border-border/50 hover:border-primary/50 hover:bg-secondary/80 transition-colors"
            onClick={handleAuthenticate}
            disabled={!address || (step !== "idle" && step !== "error")}
          >
            {step === "idle" || step === "error" ? (
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4" /> Generate Proof
              </span>
            ) : step === "requesting" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Requesting Challenge...
              </span>
            ) : step === "scanning" ? (
              <span className="flex items-center gap-2 text-primary animate-pulse">
                <Fingerprint className="w-4 h-4" /> Scan Fingerprint
              </span>
            ) : step === "verifying" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Verifying Signature...
              </span>
            ) : null}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
