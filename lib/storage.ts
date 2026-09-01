import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Provider-agnostic S3-compatible object storage — point it at Cloudflare
 * R2 (recommended: forever-free 10 GB + zero egress), Backblaze B2, or
 * Storj by setting the S3_* env vars. Same code for all of them; only the
 * endpoint/credentials differ. Used ONLY server-side (secrets), so the
 * browser uploads via short-lived presigned URLs and never sees the keys.
 *
 * Env: S3_ENDPOINT, S3_REGION (default "auto" for R2), S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, S3_BUCKET.
 */
const endpoint = process.env.S3_ENDPOINT || "";
const region = process.env.S3_REGION || "auto";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "";
const bucket = process.env.S3_BUCKET || "";

/** False until the S3_* env vars are set — callers fall back to asset
 *  links so the intake form keeps working before storage is configured. */
export const isStorageConfigured = Boolean(endpoint && accessKeyId && secretAccessKey && bucket);

const client = isStorageConfigured
  ? new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // R2 / B2 / Storj S3 gateways all accept path-style addressing.
      forcePathStyle: true,
    })
  : null;

/** Presigned PUT so the browser uploads straight to storage — credentials
 *  stay on the server and the upload skips the serverless body-size limit.
 *  When contentLength is given it's baked into the signature, so the client
 *  can't upload more bytes than it declared (an oversized body fails the
 *  signature) — this is what actually caps upload size at the object store,
 *  since the declared size alone is client-controlled. */
export async function presignUpload(
  key: string,
  contentType: string,
  contentLength?: number,
  expiresIn = 600
) {
  if (!client) throw new Error("Object storage is not configured.");
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    ...(contentLength ? { ContentLength: contentLength } : {}),
  });
  return getSignedUrl(client, cmd, { expiresIn });
}

/** Presigned GET for the dashboard to view or download an uploaded asset. */
export async function presignDownload(key: string, filename?: string, expiresIn = 3600) {
  if (!client) throw new Error("Object storage is not configured.");
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"` } : {}),
  });
  return getSignedUrl(client, cmd, { expiresIn });
}
