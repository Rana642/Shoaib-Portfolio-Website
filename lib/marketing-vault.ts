import "server-only";
import { db } from "./dashboard/db";
import { decryptField } from "./api-vault-crypto";

/**
 * Shared credential lookup for every marketing-API MCP tool (Google Ads,
 * GA4, GSC, GTM, Meta Marketing) — all read from the same api_credentials
 * vault (lib/api-vault-crypto.ts) that /dashboard/api-vault manages. Each
 * service is expected to have exactly one active row; if Shoaib ever needs
 * more than one Google Ads/Meta account, the tools take an explicit
 * customerId/actId argument rather than picking a row here.
 */
export async function getVaultCredential(service: string): Promise<Record<string, string>> {
  const { data, error } = await db
    .from("api_credentials")
    .select("fields, label")
    .eq("service", service)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Vault lookup failed for '${service}': ${error.message}`);
  if (!data) throw new Error(`No active '${service}' credential in the API Vault (/dashboard/api-vault).`);

  const fields = data.fields as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [name, ciphertext] of Object.entries(fields)) {
    out[name] = decryptField(ciphertext);
  }
  return out;
}
