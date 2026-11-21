import "server-only";
import { NextResponse } from "next/server";
import { getGoogleAccessToken } from "@/lib/google-oauth-token";
import { verifyDriveDownload } from "@/lib/drive-download-link";

export const dynamic = "force-dynamic";

// GET /api/drive-download?id=<fileId>&sig=<hmac>
// Streams one Drive file to a caller who holds a valid signed link.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!id.match(/^[A-Za-z0-9_-]{10,}$/) || !verifyDriveDownload(id, sig)) {
    return NextResponse.json({ ok: false, error: "invalid or expired link" }, { status: 401 });
  }

  const token = await getGoogleAccessToken("google_drive");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok || !res.body) {
    return NextResponse.json({ ok: false, error: `Drive ${res.status}` }, { status: 502 });
  }
  const headers = new Headers();
  headers.set("content-type", res.headers.get("content-type") ?? "application/octet-stream");
  const len = res.headers.get("content-length");
  if (len) headers.set("content-length", len);
  headers.set("content-disposition", `attachment; filename="${id}"`);
  return new Response(res.body, { status: 200, headers });
}
