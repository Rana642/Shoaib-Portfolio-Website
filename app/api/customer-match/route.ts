import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createCrmUserList, uploadCustomerMatchMembers } from "@/lib/google-ads-client";

// Receives a hotel's confirmed past guests and uploads them to Google Ads as a
// Customer Match (first-party) list. Auth: shared secret in x-offline-secret
// (same secret as /api/offline-conversions). Contact data is hashed here.

type Guest = { email?: string | null; phone?: string | null };
type Body = {
  customerId: string;          // e.g. "622-325-0696"
  loginCustomerId?: string;    // MCC, e.g. "885-934-7478"
  listName: string;            // e.g. "Elegant - confirmed guests 2026-11"
  guests: Guest[];
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function secretOk(received: string | null): boolean {
  const expected = process.env.OFFLINE_CONVERSIONS_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build Google's hashed identifier set for one guest (email and/or phone). */
function identifiersFor(g: Guest): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const email = g.email?.trim().toLowerCase();
  if (email) out.push({ hashedEmail: sha256(email) });
  const digits = (g.phone ?? "").replace(/[^0-9]/g, "");
  if (digits) out.push({ hashedPhoneNumber: sha256(`+${digits}`) });
  return out;
}

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-offline-secret"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  if (!body.customerId || !body.listName || !Array.isArray(body.guests)) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
  }

  const members = body.guests.map(identifiersFor).filter((ids) => ids.length > 0);
  if (members.length === 0) {
    return NextResponse.json({ ok: false, error: "no usable email or phone" }, { status: 400 });
  }

  try {
    const listRn = await createCrmUserList(body.customerId, body.listName, body.loginCustomerId);
    const job = await uploadCustomerMatchMembers(body.customerId, listRn, members, body.loginCustomerId);
    return NextResponse.json({
      ok: true,
      userList: listRn,
      job: job.jobResourceName,
      members: members.length,
      batches: job.batches,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "upload failed" }, { status: 502 });
  }
}
