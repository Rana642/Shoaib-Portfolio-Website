/**
 * Zero-knowledge vault crypto — runs ONLY in the browser (Web Crypto API,
 * no dependencies). The server never sees the master password, the recovery
 * key, or the data key; it only stores the ciphertext and the wrapped keys
 * this module produces.
 *
 * Design (key-wrapping, like Bitwarden's account key):
 *  - A random Data Key (DK) encrypts every entry.
 *  - DK is wrapped (encrypted) twice: once by a key derived from the master
 *    password, once by a random recovery key shown to the user only once.
 *  - Unlocking = derive/import the wrapping key → decrypt DK → decrypt
 *    entries. Changing the master password only re-wraps DK.
 */

const PBKDF2_ITERATIONS = 600_000;

const te = new TextEncoder();
const td = new TextDecoder();

export function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** AES-GCM key derived from a passphrase + salt (for wrapping DK). */
async function deriveWrappingKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", te.encode(passphrase) as BufferSource, "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Import raw 32 bytes (the recovery key) as an AES-GCM wrapping key. */
async function importRawKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function aesEncrypt(key: CryptoKey, data: Uint8Array): Promise<{ ct: string; iv: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
  return { ct: b64encode(ct), iv: b64encode(iv) };
}

async function aesDecrypt(key: CryptoKey, ctB64: string, ivB64: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) as BufferSource },
    key,
    b64decode(ctB64) as BufferSource
  );
  return new Uint8Array(pt);
}

export type VaultMetaPayload = {
  salt: string;
  iterations: number;
  wrapped_dk: string;
  wrapped_dk_iv: string;
  wrapped_dk_recovery: string;
  wrapped_dk_recovery_iv: string;
};

/** First-time setup: creates the data key, wraps it under the master
 *  password and a fresh recovery key, and returns the meta to persist plus
 *  the data key (unlocked) and the recovery key to show the user once. */
export async function setupVault(masterPassword: string): Promise<{
  meta: VaultMetaPayload;
  dataKey: CryptoKey;
  recoveryKey: string;
}> {
  const salt = randomBytes(16);
  const dkRaw = randomBytes(32);
  const recoveryRaw = randomBytes(32);

  const masterKey = await deriveWrappingKey(masterPassword, salt, PBKDF2_ITERATIONS);
  const recoveryKey = await importRawKey(recoveryRaw);

  const wrappedMaster = await aesEncrypt(masterKey, dkRaw);
  const wrappedRecovery = await aesEncrypt(recoveryKey, dkRaw);

  const dataKey = await importRawKey(dkRaw);

  return {
    meta: {
      salt: b64encode(salt),
      iterations: PBKDF2_ITERATIONS,
      wrapped_dk: wrappedMaster.ct,
      wrapped_dk_iv: wrappedMaster.iv,
      wrapped_dk_recovery: wrappedRecovery.ct,
      wrapped_dk_recovery_iv: wrappedRecovery.iv,
    },
    dataKey,
    // Grouped for readability when the user writes it down.
    recoveryKey: b64encode(recoveryRaw),
  };
}

/** Unlock with the master password. Throws if the password is wrong (the
 *  GCM auth tag fails to verify). Returns the raw key too, so the master
 *  password can be changed without re-entering the recovery key. */
export async function unlockWithPassword(
  meta: VaultMetaPayload,
  masterPassword: string
): Promise<{ dataKey: CryptoKey; dkRaw: Uint8Array }> {
  const masterKey = await deriveWrappingKey(masterPassword, b64decode(meta.salt), meta.iterations);
  const dkRaw = await aesDecrypt(masterKey, meta.wrapped_dk, meta.wrapped_dk_iv);
  return { dataKey: await importRawKey(dkRaw), dkRaw };
}

/** Unlock with the recovery key. Returns the data key AND its raw bytes so
 *  the caller can immediately re-wrap under a new master password. */
export async function unlockWithRecovery(
  meta: VaultMetaPayload,
  recoveryKeyB64: string
): Promise<{ dataKey: CryptoKey; dkRaw: Uint8Array }> {
  const recoveryKey = await importRawKey(b64decode(recoveryKeyB64.trim()));
  const dkRaw = await aesDecrypt(recoveryKey, meta.wrapped_dk_recovery, meta.wrapped_dk_recovery_iv);
  return { dataKey: await importRawKey(dkRaw), dkRaw };
}

/** Re-wrap the data key under a new master password (password change or
 *  recovery reset). Returns the new salt + wrapped_dk to persist. */
export async function rewrapMaster(dkRaw: Uint8Array, newMasterPassword: string): Promise<{
  salt: string;
  iterations: number;
  wrapped_dk: string;
  wrapped_dk_iv: string;
}> {
  const salt = randomBytes(16);
  const masterKey = await deriveWrappingKey(newMasterPassword, salt, PBKDF2_ITERATIONS);
  const wrapped = await aesEncrypt(masterKey, dkRaw);
  return { salt: b64encode(salt), iterations: PBKDF2_ITERATIONS, wrapped_dk: wrapped.ct, wrapped_dk_iv: wrapped.iv };
}

/** Mint a brand-new recovery key and re-wrap the data key under it, from an
 *  already-unlocked vault (the caller holds dkRaw). Any previous recovery key
 *  stops working the moment this is persisted. Returns the new recovery key
 *  to show the user once, plus the wrapped_dk_recovery to persist. */
export async function rewrapRecovery(dkRaw: Uint8Array): Promise<{
  recoveryKey: string;
  wrapped_dk_recovery: string;
  wrapped_dk_recovery_iv: string;
}> {
  const recoveryRaw = randomBytes(32);
  const recoveryKey = await importRawKey(recoveryRaw);
  const wrapped = await aesEncrypt(recoveryKey, dkRaw);
  return {
    recoveryKey: b64encode(recoveryRaw),
    wrapped_dk_recovery: wrapped.ct,
    wrapped_dk_recovery_iv: wrapped.iv,
  };
}

// ── Sealed submissions (client portal → vault) ─────────────────
// A client must be able to encrypt logins TO the vault without being able
// to read anything in it. So the vault also has an RSA-OAEP keypair: the
// public key is stored in plaintext and handed to the portal; the private
// key is encrypted with the data key, so it only ever exists unencrypted
// in Shoaib's unlocked browser. A submission is sealed with a one-off
// AES-256-GCM key, and that key is RSA-encrypted to the vault public key.

const RSA = { name: "RSA-OAEP", hash: "SHA-256" } as const;

export type VaultKeypairPayload = {
  public_key: string;
  wrapped_private_key: string;
  wrapped_private_key_iv: string;
};

/** Mints the vault's keypair (once), wrapping the private key under the
 *  data key. Run in the unlocked vault. */
export async function generateVaultKeypair(dataKey: CryptoKey): Promise<VaultKeypairPayload> {
  const pair = await crypto.subtle.generateKey(
    { ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["encrypt", "decrypt"]
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const wrapped = await aesEncrypt(dataKey, new Uint8Array(pkcs8));
  return { public_key: b64encode(spki), wrapped_private_key: wrapped.ct, wrapped_private_key_iv: wrapped.iv };
}

/** The vault's private key, unwrapped with the data key (non-extractable). */
export async function unwrapVaultPrivateKey(dataKey: CryptoKey, wrapped: string, iv: string): Promise<CryptoKey> {
  const pkcs8 = await aesDecrypt(dataKey, wrapped, iv);
  return crypto.subtle.importKey("pkcs8", pkcs8 as BufferSource, RSA, false, ["decrypt"]);
}

export type SealedPayload = { wrapped_key: string; ciphertext: string; iv: string };

/** Encrypts a payload so only the vault can open it (runs in the portal). */
export async function sealForVault(publicKeyB64: string, payload: unknown): Promise<SealedPayload> {
  const publicKey = await crypto.subtle.importKey("spki", b64decode(publicKeyB64) as BufferSource, RSA, false, ["encrypt"]);
  const oneOff = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const raw = await crypto.subtle.exportKey("raw", oneOff);
  const wrappedKey = await crypto.subtle.encrypt(RSA, publicKey, raw);
  const { ct, iv } = await aesEncrypt(oneOff, te.encode(JSON.stringify(payload)));
  return { wrapped_key: b64encode(wrappedKey), ciphertext: ct, iv };
}

/** Opens a sealed submission with the vault's private key. */
export async function openVaultSeal<T>(privateKey: CryptoKey, sealed: SealedPayload): Promise<T> {
  const raw = await crypto.subtle.decrypt(RSA, privateKey, b64decode(sealed.wrapped_key) as BufferSource);
  const oneOff = await importRawKey(new Uint8Array(raw));
  return JSON.parse(td.decode(await aesDecrypt(oneOff, sealed.ciphertext, sealed.iv))) as T;
}

/** Encrypt an entry's secret payload with the data key. */
export async function encryptSecret(dataKey: CryptoKey, secret: unknown): Promise<{ ciphertext: string; iv: string }> {
  const { ct, iv } = await aesEncrypt(dataKey, te.encode(JSON.stringify(secret)));
  return { ciphertext: ct, iv };
}

/** Decrypt an entry's secret payload. */
export async function decryptSecret<T>(dataKey: CryptoKey, ciphertext: string, iv: string): Promise<T> {
  const pt = await aesDecrypt(dataKey, ciphertext, iv);
  return JSON.parse(td.decode(pt)) as T;
}
