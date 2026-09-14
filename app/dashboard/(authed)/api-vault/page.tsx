import { listCredentials } from "@/lib/dashboard/actions/api-vault";
import { isApiVaultCryptoConfigured } from "@/lib/api-vault-crypto";
import { PageHeader, Card } from "@/components/dashboard/ui";
import AddCredentialButton from "@/components/dashboard/api-vault/AddCredentialButton";
import CredentialsList from "@/components/dashboard/api-vault/CredentialsList";

export const dynamic = "force-dynamic";
export const metadata = { title: "API Vault" };

export default async function ApiVaultPage() {
  const credentials = await listCredentials();

  return (
    <>
      <PageHeader
        title="API Vault"
        description="Operational API credentials — Google Ads, Meta Marketing API, GA4, GTM, GSC, Google Business Profile and more. Separate from the client password vault: this one is server-decryptable, meant for an MCP server to read and act on directly, not locked behind a master password."
        action={isApiVaultCryptoConfigured ? <AddCredentialButton /> : undefined}
      />

      {!isApiVaultCryptoConfigured && (
        <Card className="p-4 mb-8 border-citrus/40 bg-citrus/10">
          <p className="text-small">
            <strong>API_VAULT_ENCRYPTION_KEY</strong> isn&apos;t set on the server yet — the vault can&apos;t
            encrypt or decrypt anything until it is. Add it to <code>.env.local</code> and to Vercel&apos;s
            environment variables, then redeploy.
          </p>
        </Card>
      )}

      <CredentialsList credentials={credentials} />
    </>
  );
}
