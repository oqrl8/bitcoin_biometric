import { RegisterPanel } from "@/components/register-panel";
import { CredentialsList } from "@/components/credentials-list";
import { StreamPipeline } from "@/components/stream-pipeline";
import { Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono selection:bg-primary selection:text-black">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-black">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold uppercase tracking-widest text-sm leading-tight">Sovereign Vault</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Biometric Identity</p>
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-primary border border-primary/20 px-2 py-1 bg-primary/5">
            System Online
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-12">

        {/* Registration hero */}
        <section className="border border-border/50 bg-card/20 px-6 py-10 flex flex-col items-center gap-2">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-4">New Account</p>
          <RegisterPanel />
        </section>

        {/* Accounts list */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Registered Accounts</h2>
            <span className="text-[10px] text-muted-foreground">Tap Verify to prove identity</span>
          </div>
          <CredentialsList />
        </section>

        {/* Stream pipeline simulation */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground">Message Stream Simulation</h2>
            <span className="text-[10px] text-muted-foreground">apply → eval → address</span>
          </div>
          <StreamPipeline />
        </section>

        {/* Protocol note */}
        <section className="p-5 border border-border/30 bg-card/10 text-[10px] text-muted-foreground space-y-3">
          <h3 className="font-display uppercase tracking-widest text-foreground text-[10px]">How It Works</h3>
          <ul className="space-y-2 list-disc list-inside pl-2 text-primary/60">
            <li>Your fingerprint generates an ECDSA P-256 keypair inside the device's secure enclave.</li>
            <li>The private key never leaves the hardware boundary — not even this app can read it.</li>
            <li>Verify scans your fingerprint again and produces a signed cryptographic proof of identity.</li>
            <li>The sign counter increments each use — any replay attack resets it and is detected.</li>
          </ul>
        </section>

      </main>
    </div>
  );
}
