import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/dashboard/auth";
import { brokenConnections } from "@/lib/connection-health";

/** Every broken connection right now, for the dashboard's pop-up (components/dashboard/ConnectionAlert). */
export async function GET() {
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await brokenConnections().catch(() => []);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
