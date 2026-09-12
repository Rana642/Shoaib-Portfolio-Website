import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

/**
 * Server-side AES-256-GCM for social access tokens. Unlike the zero-knowledge
 * vault (lib/vault-crypto.ts), the key lives on the server (SOCIAL_TOKENS_ENCRYPTION_KEY)
 * so the scheduled-post cron can decrypt and post without anyone unlocking
 * anything — these are operational credentials, not end-user secrets.
 */

const rawKey = process.env.SOCIAL_TOKENS_ENCRYPTION_KEY || "";
// Accept any passphrase length by stretching it to 32 bytes — avoids a hard
// crash if the env var isn't exactly a 32-byte base64 string.
const key = rawKey ? scryptSync(rawKey, "adsbyshoaib-social-tokens", 32) : null;

export const isSocialCryptoConfigured = Boolean(key);

export function encryptToken(plaintext: string): string {
  if (!key) throw new Error("SOCIAL_TOKENS_ENCRYPTION_KEY is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptToken(payload: string): string {
  if (!key) throw new Error("SOCIAL_TOKENS_ENCRYPTION_KEY is not configured.");
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
