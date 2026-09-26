import "server-only";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/dashboard/auth";
import { portalClientId } from "@/lib/dashboard/roles";

/**
 * The signed-in client-portal user and the client they belong to, or null.
 * Every portal page and action scopes its queries to `clientId` from here —
 * never to an id sent by the browser.
 */
export async function getPortalUser() {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const clientId = portalClientId(user);
  return user && clientId ? { user, clientId } : null;
}

/** For portal pages/actions: the portal user, or off to the portal login. */
export async function requirePortalUser() {
  const portalUser = await getPortalUser();
  if (!portalUser) redirect("/portal/login");
  return portalUser;
}
