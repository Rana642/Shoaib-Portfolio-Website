import "server-only";
import { getGoogleAccessToken } from "./google-oauth-token";
import { getVaultCredential } from "./marketing-vault";

// Google Ads API versions sunset on a strict ~1yr schedule — v19/v20/v21
// are already gone (404, not a JSON error) as of 2026-09-16. v22 answers
// UNSUPPORTED_VERSION as of 2026-10-31; v23-v26 verified live against the real
// API (not just docs, which can lag), and Keyword Planner generateKeywordIdeas
// works on v25. Using v25; check again before ~Oct 2027.
const API_VERSION = "v25";
const BASE = `https://googleads.googleapis.com/${API_VERSION}`;

async function headers(loginCustomerId?: string): Promise<Record<string, string>> {
  const [accessToken, cred] = await Promise.all([
    getGoogleAccessToken("google_ads"),
    getVaultCredential("google_ads"),
  ]);
  const h: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": cred.developer_token,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) h["login-customer-id"] = loginCustomerId.replace(/-/g, "");
  return h;
}

async function call(path: string, body: unknown, loginCustomerId?: string) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: await headers(loginCustomerId),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Google Ads API error (${res.status}): ${JSON.stringify(json ?? {})}`);
  }
  return json;
}

/** Lists every customer (account) this refresh token can reach — the
 *  starting point for finding a customerId to pass to search/mutate. */
export async function listAccessibleCustomers(): Promise<unknown> {
  const accessToken = await getGoogleAccessToken("google_ads");
  const cred = await getVaultCredential("google_ads");
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": cred.developer_token },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google Ads API error (${res.status}): ${JSON.stringify(json)}`);
  return json;
}

/** Arbitrary GAQL read — covers every audit need (campaigns, ad groups, ads,
 *  keywords, search terms, change history, performance metrics, ...). */
export async function googleAdsSearch(customerId: string, gaql: string, loginCustomerId?: string): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(`customers/${id}/googleAds:search`, { query: gaql }, loginCustomerId);
}

/** Keyword Planner's keyword-ideas generator — search volume, competition,
 *  bid ranges for new keyword suggestions. Not expressible via GAQL
 *  (googleAdsSearch only reports on keywords already in the account); this
 *  is a separate custom-method endpoint. Verified live 2026-09-17 against
 *  a real account (real search-volume data returned for "hotel in multan"). */
export async function generateKeywordIdeas(customerId: string, requestBody: Record<string, unknown>, loginCustomerId?: string): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(`customers/${id}:generateKeywordIdeas`, requestBody, loginCustomerId);
}

/** Arbitrary create/update/remove across any mutable Google Ads resource
 *  (campaigns, campaignBudgets, adGroups, adGroupAds, adGroupCriteria,
 *  campaignCriteria, ...) — the operations shape matches Google's own
 *  mutate API 1:1, so anything the real API supports is reachable here. */
export async function googleAdsMutate(
  customerId: string,
  resource: string,
  operations: unknown[],
  opts: { loginCustomerId?: string; validateOnly?: boolean } = {}
): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(
    `customers/${id}/${resource}:mutate`,
    { operations, validateOnly: Boolean(opts.validateOnly), partialFailure: false },
    opts.loginCustomerId
  );
}

/** Offline / click conversion upload (ConversionUploadService). Sends a
 *  confirmed booking back to Google, keyed by gclid + order_id so a repeat
 *  upload of the same booking is deduplicated by Google. `conversions` items
 *  follow Google's ClickConversion shape. partialFailure: true so one bad row
 *  does not reject the whole batch — callers must read partialFailureError. */
export async function uploadClickConversions(
  customerId: string,
  conversions: Array<Record<string, unknown>>,
  loginCustomerId?: string
): Promise<unknown> {
  const id = customerId.replace(/-/g, "");
  return call(
    `customers/${id}:uploadClickConversions`,
    { conversions, partialFailure: true, validateOnly: false },
    loginCustomerId
  );
}

/** Customer Match: create a first-party (CRM) user list. Returns its resource
 *  name, e.g. customers/123/userLists/456. membershipLifeSpan is in days. */
export async function createCrmUserList(
  customerId: string,
  name: string,
  loginCustomerId?: string
): Promise<string> {
  const id = customerId.replace(/-/g, "");
  const res = (await call(
    `customers/${id}/userLists:mutate`,
    {
      operations: [
        {
          create: {
            name,
            description: "Confirmed past guests (hashed contact info), first-party",
            membershipLifeSpan: 540,
            crmBasedUserList: { dataSourceType: "FIRST_PARTY", uploadKeyType: "CONTACT_INFO" },
          },
        },
      ],
    },
    loginCustomerId
  )) as { results?: Array<{ resourceName?: string }> };
  const rn = res.results?.[0]?.resourceName;
  if (!rn) throw new Error("userLists create returned no resourceName");
  return rn;
}

/** Customer Match: upload hashed members into a list. `members` are already
 *  hashed identifiers. Creates an offline job, adds operations in batches,
 *  then runs the job. Google processes it asynchronously (minutes to ~1 day). */
export async function uploadCustomerMatchMembers(
  customerId: string,
  userListResourceName: string,
  members: Array<Array<Record<string, string>>>,
  loginCustomerId?: string
): Promise<{ jobResourceName: string; batches: number }> {
  const id = customerId.replace(/-/g, "");
  const created = (await call(
    `customers/${id}/offlineUserDataJobs:create`,
    {
      job: {
        type: "CUSTOMER_MATCH_USER_LIST",
        customerMatchUserListMetadata: { userList: userListResourceName },
      },
    },
    loginCustomerId
  )) as { resourceName?: string };
  const jobRn = created.resourceName;
  if (!jobRn) throw new Error("offlineUserDataJobs create returned no resourceName");
  const jobId = jobRn.split("/").pop();

  const BATCH = 500;
  let batches = 0;
  for (let i = 0; i < members.length; i += BATCH) {
    const slice = members.slice(i, i + BATCH);
    await call(
      `customers/${id}/offlineUserDataJobs/${jobId}:addOperations`,
      {
        enablePartialFailure: true,
        operations: slice.map((userIdentifiers) => ({ create: { userIdentifiers } })),
      },
      loginCustomerId
    );
    batches++;
  }

  await call(`customers/${id}/offlineUserDataJobs/${jobId}:run`, {}, loginCustomerId);
  return { jobResourceName: jobRn, batches };
}
