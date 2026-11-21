import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Permanent signed link for downloading one Drive file through ABS.
// The link carries no Google token: it is the file id plus an HMAC signature
// made with OFFLINE_CONVERSIONS_SECRET. Anyone holding the link can download
// that one file, so treat the link like the file itself.

function secret(): string {
  const s = process.env.OFFLINE_CONVERSIONS_SECRET;
  if (!s) throw new Error("OFFLINE_CONVERSIONS_SECRET is not set");
  return s;
}

export function signDriveDownload(fileId: string): string {
  return createHmac("sha256", secret()).update(`drive-download:${fileId}`).digest("hex");
}

export function verifyDriveDownload(fileId: string, sig: string): boolean {
  if (!fileId || !sig) return false;
  const expected = Buffer.from(signDriveDownload(fileId));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
