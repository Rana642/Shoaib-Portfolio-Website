import "server-only";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "node:crypto";

/**
 * Server-side AES-256-GCM for the API Vault (Google Ads, Meta Marketing API,
 * GA4, GTM, GSC, GMB, etc.). Deliberately its own key — API_VAULT_ENCRYPTION_KEY
 * — separate from both the zero-knowledge password vault (lib/vault-crypto.ts,
 * browser-only, needs a master password) and the social poster's tokens
 * (lib/social-crypto.ts, SOCIAL_TOKENS_ENCRYPTION_KEY). These are operational
 * API credentials meant to be read unattended by a future MCP server, so the
 * key lives on the server like the social tokens — but a separate key means
 * rotating one vault's key never touches the other.
 */

const rawKey = process.env.API_VAULT_ENCRYPTION_KEY || "";
// Accept any passphrase length by stretching it to 32 bytes — avoids a hard
// crash if the env var isn't exactly a 32-byte base64 string.
const key = rawKey ? scryptSync(rawKey, "adsbyshoaib-api-vault", 32) : null;

export const isApiVaultCryptoConfigured = Boolean(key);

export function encryptField(plaintext: string): string {
  if (!key) throw new Error("API_VAULT_ENCRYPTION_KEY is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptField(payload: string): string {
  if (!key) throw new Error("API_VAULT_ENCRYPTION_KEY is not configured.");
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
