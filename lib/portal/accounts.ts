"use server";

import { z } from "zod";
import { db } from "@/lib/dashboard/db";
import { can, canSeeProject, getPortalUser } from "@/lib/portal/auth";
import { rateLimit } from "@/lib/rate-limit";
import { resend, isResendConfigured, fromEmail, toEmail } from "@/lib/resend";
import { isRequestKey, requestKeyLabel } from "@/lib/vault-platforms";

const submissionSchema = z.object({
  projectId: z.string().uuid().nullable(),
  platforms: z.array(z.string().refine(isRequestKey)).min(1).max(30),
  wrapped_key: z.string().min(100).max(2000),
  ciphertext: z.string().min(1).max(500_000),
  iv: z.string().min(1).max(64),
});

/**
 * Stores logins a client sealed in their browser to the vault's public key
 * (lib/vault-crypto.ts sealForVault). The server can't read them; it only
 * files them under the signed-in client — never a client id from the
 * browser — and ticks off any matching requests.
 */
export async function submitAccounts(input: z.infer<typeof submissionSchema>) {
  const portalUser = await getPortalUser();
  if (!portalUser) return { error: "Your session has ended — sign in again." };
  const { user, clientId } = portalUser;
  if (!can(portalUser, "credentials")) return { error: "Sending accounts isn't switched on for you." };

  const parsed = submissionSchema.safeParse(input);
  if (!parsed.success) return { error: "Those details couldn't be sent — nothing was saved." };
  const { projectId, platforms, wrapped_key, ciphertext, iv } = parsed.data;
  if (!canSeeProject(portalUser, projectId)) return { error: "That project isn't one of yours." };

  if (!(await rateLimit(`portal-submit:${user.id}`, 20, 3600))) {
    return { error: "That's a lot of submissions in an hour — try again a little later." };
  }

  let projectName: string | null = null;
  if (projectId) {
    const { data: project } = await db.from("client_projects").select("client_id, name").eq("id", projectId).maybeSingle();
    if (project?.client_id !== clientId) return { error: "That project isn't one of yours." };
    projectName = project.name;
  }

  const { error } = await db.from("vault_submissions").insert({
    client_id: clientId,
    project_id: projectId,
    submitted_by: user.id,
    platforms,
    wrapped_key,
    ciphertext,
    iv,
  });
  if (error) return { error: "Couldn't send your details right now — please try again." };

  // What was asked for and now arrived stops showing as "requested".
  const requests = db
    .from("vault_requests")
    .update({ fulfilled_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .in("platform", platforms)
    .is("fulfilled_at", null);
  await (projectId ? requests.eq("project_id", projectId) : requests.is("project_id", null));

  // Let Shoaib know — names only, never anything from inside the seal.
  if (isResendConfigured) {
    const { data: client } = await db.from("clients").select("name").eq("id", clientId).maybeSingle();
    const list = platforms.map(requestKeyLabel).join(", ");
    await resend.emails
      .send({
        from: fromEmail,
        to: toEmail,
        subject: `${client?.name ?? "A client"} sent ${platforms.length} account${platforms.length === 1 ? "" : "s"}`,
        text: `${client?.name ?? "A client"}${projectName ? ` (${projectName})` : ""} sent logins through the client portal: ${list}.\n\nOpen the Password Vault to review and save them.`,
      })
      .catch((e: unknown) => console.error("[portal] notify failed:", e));
  }

  return { ok: true };
}
