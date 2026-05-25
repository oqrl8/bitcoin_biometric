import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webauthnCredentialsTable = pgTable("webauthn_credentials", {
  id: serial("id").primaryKey(),
  bitcoinAddress: text("bitcoin_address").notNull().unique(),
  credentialId: text("credential_id").notNull().unique(),
  publicKey: text("public_key").notNull(),
  signCount: integer("sign_count").notNull().default(0),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  // Commitment hash linking this account to a contingent pair.
  // Account A stores the commitment it originated; Account B stores the same
  // commitment to prove it was derived from A — anonymous mutual dependency.
  linkedCommitment: text("linked_commitment"),
});

export const insertWebauthnCredentialSchema = createInsertSchema(webauthnCredentialsTable).omit({
  id: true,
  registeredAt: true,
  lastUsedAt: true,
  signCount: true,
});

export type InsertWebauthnCredential = z.infer<typeof insertWebauthnCredentialSchema>;
export type WebauthnCredential = typeof webauthnCredentialsTable.$inferSelect;

export const webauthnChallengesTable = pgTable("webauthn_challenges", {
  id: serial("id").primaryKey(),
  challenge: text("challenge").notNull(),
  bitcoinAddress: text("bitcoin_address").notNull(),
  type: text("type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WebauthnChallenge = typeof webauthnChallengesTable.$inferSelect;

// Stores the pending/established link between two contingent accounts.
// linkToken is given to Account B; commitment = sha256(linkToken) is
// what both accounts durably store — one-way, so neither reveals the other.
export const webauthnLinksTable = pgTable("webauthn_links", {
  id: serial("id").primaryKey(),
  linkToken: text("link_token").notNull().unique(),
  commitment: text("commitment").notNull().unique(),
  originatorCredentialId: text("originator_credential_id").notNull(),
  linkedCredentialId: text("linked_credential_id"),
  status: text("status").notNull().default("pending"), // "pending" | "established"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type WebauthnLink = typeof webauthnLinksTable.$inferSelect;
