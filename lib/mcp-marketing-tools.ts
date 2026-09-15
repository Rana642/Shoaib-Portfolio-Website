import "server-only";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listAccessibleCustomers, googleAdsSearch, googleAdsMutate } from "./google-ads-client";
import { googleApiRequest } from "./google-api-passthrough";
import { metaMarketingRequest, listMetaAdAccounts } from "./meta-marketing-client";

/**
 * Full-functionality marketing-API tools: Google Ads (audit/edit/create),
 * Meta Marketing API, GA4, Google Search Console, and Google Tag Manager —
 * per Shoaib's explicit "full functionality, sab APIs" request (2026-09-16),
 * a deliberate step up from the social-poster tools' "start small" scoping.
 *
 * Design: every service here has a huge, evolving object model (Google Ads
 * alone has 190+ mutable resource types). Rather than hand-writing a bespoke
 * tool per field/resource — which would be perpetually incomplete — each
 * service gets a thin passthrough onto its real REST shape (GAQL for Ads,
 * path/method/body for the Google Admin-style APIs and Graph API). Whoever
 * calls these tools is expected to already know (or look up) the target
 * API's request shape; the tool itself just handles auth + the HTTP call.
 *
 * Safety: read-only calls (search, GET) always execute directly. Every
 * write call (mutate, non-GET passthrough) requires confirm=true or it
 * returns a preview of exactly what would be sent instead of sending it —
 * layered on top of Claude.ai/Claude Code's own per-tool approval gate, per
 * the project's standing rule to confirm before risky live actions
 * (real ad spend, live tag/site changes).
 */

function formatError(error: unknown): string {
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: { data } };
}

function previewResult(label: string, wouldSend: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `PREVIEW ONLY — nothing was sent. Re-run with confirm=true to actually execute this ${label}.\n\n${JSON.stringify(wouldSend, null, 2)}`,
      },
    ],
  };
}

export function registerMarketingTools(server: McpServer): void {
  // ── Google Ads ──────────────────────────────────────────────────────
  server.registerTool(
    "google_ads_list_accounts",
    {
      title: "List Google Ads Accounts",
      description: "Lists every Google Ads customer account reachable with the vault's refresh token (customers:listAccessibleCustomers). Use the returned resource names (customers/1234567890) to get a customerId for google_ads_search/google_ads_mutate.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        return jsonResult(await listAccessibleCustomers());
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "google_ads_search",
    {
      title: "Google Ads Audit (GAQL Search)",
      description: `Runs a read-only GAQL query against the Google Ads API (v19) — this IS the audit tool: query campaign/ad_group/ad_group_ad/keyword_view/search_term_view/campaign_budget/metrics.* etc. Example: "SELECT campaign.id, campaign.name, campaign.status, metrics.cost_micros, metrics.clicks FROM campaign WHERE segments.date DURING LAST_30_DAYS".

Args:
  - customerId (string): the Ads account to query, digits only or with dashes (e.g. "123-456-7890").
  - gaql (string): the full GAQL query.
  - loginCustomerId (string, optional): the manager (MCC) account id, if customerId is a client account under a manager.`,
      inputSchema: {
        customerId: z.string().min(1),
        gaql: z.string().min(1),
        loginCustomerId: z.string().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ customerId, gaql, loginCustomerId }: { customerId: string; gaql: string; loginCustomerId?: string }) => {
      try {
        return jsonResult(await googleAdsSearch(customerId, gaql, loginCustomerId));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "google_ads_mutate",
    {
      title: "Create/Edit/Remove Google Ads Objects",
      description: `Creates, updates, or removes Google Ads objects — campaigns, campaignBudgets, adGroups, adGroupAds, adGroupCriteria (keywords), campaignCriteria, assets, and every other mutable resource. Mirrors the real Google Ads API mutate shape exactly: POST customers/{id}/{resource}:mutate with an operations array.

Args:
  - customerId (string)
  - resource (string): the resource collection, e.g. "campaigns", "campaignBudgets", "adGroups", "adGroupAds", "adGroupCriteria".
  - operations (array): each item is {"create": {...}} or {"update": {...}, "updateMask": "field,paths"} or {"remove": "resourceName"} — exactly as the Google Ads API expects. Resource names use the pattern "customers/{id}/campaigns/{campaignId}" etc.
  - loginCustomerId (string, optional): manager account id if needed.
  - confirm (boolean): when false/omitted, runs with validateOnly=true (Google validates the request server-side and reports errors, but changes nothing) and returns that validation result. Set confirm=true to actually apply the change.

Example — pause a campaign: resource="campaigns", operations=[{"update": {"resourceName": "customers/123/campaigns/456", "status": "PAUSED"}, "updateMask": "status"}]
Example — create a budget then a campaign: two calls, resource="campaignBudgets" first (get its resourceName back), then resource="campaigns" referencing campaignBudget in the create body.`,
      inputSchema: {
        customerId: z.string().min(1),
        resource: z.string().min(1),
        operations: z.array(z.record(z.string(), z.any())).min(1),
        loginCustomerId: z.string().optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ customerId, resource, operations, loginCustomerId, confirm }: {
      customerId: string; resource: string; operations: Record<string, unknown>[]; loginCustomerId?: string; confirm?: boolean;
    }) => {
      try {
        const result = await googleAdsMutate(customerId, resource, operations, { loginCustomerId, validateOnly: !confirm });
        if (!confirm) return previewResult(`Google Ads ${resource} mutate (validated, not applied)`, result);
        return jsonResult(result);
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // ── Meta Marketing API ──────────────────────────────────────────────
  server.registerTool(
    "meta_ads_list_accounts",
    {
      title: "List Meta Ad Accounts",
      description: "Lists every Meta (Facebook/Instagram) ad account the vault's access token can reach. Use the returned id (act_...) with meta_ads_get/meta_ads_mutate.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      try {
        return jsonResult(await listMetaAdAccounts());
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "meta_ads_get",
    {
      title: "Meta Marketing API — Read (Audit)",
      description: `Read-only GET against the Meta Graph API (v21.0) Marketing surface — campaigns, adsets, ads, adcreatives, insights, custom audiences, etc.

Args:
  - path (string): e.g. "act_123456789/campaigns", "act_123456789/insights", "{adset_id}", "{ad_id}/adcreatives".
  - params (object, optional): query params as strings, e.g. { "fields": "id,name,status,daily_budget,objective", "date_preset": "last_30d", "level": "campaign" }.`,
      inputSchema: { path: z.string().min(1), params: z.record(z.string(), z.any()).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ path, params }: { path: string; params?: Record<string, unknown> }) => {
      try {
        return jsonResult(await metaMarketingRequest(path, "GET", params ?? {}));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "meta_ads_mutate",
    {
      title: "Create/Edit/Delete Meta Ads Objects",
      description: `Create, update, or delete Meta Marketing API objects — campaigns, adsets, ads, adcreatives, custom audiences, budgets, etc. Mirrors the Graph API exactly: POST to a collection path to create (e.g. "act_123/campaigns"), POST to an object id to update it (e.g. "{campaign_id}"), DELETE an object id to remove/deactivate it.

Args:
  - path (string): the Graph API path/edge to call.
  - method ("POST" | "DELETE").
  - fields (object, optional): the body params for POST, e.g. { "name": "...", "objective": "OUTCOME_TRAFFIC", "status": "PAUSED", "special_ad_categories": [] } for a campaign create.
  - confirm (boolean): when false/omitted, nothing is sent — the exact request is returned as a preview. Set true to actually execute (real ad spend / live changes).`,
      inputSchema: {
        path: z.string().min(1),
        method: z.enum(["POST", "DELETE"]),
        fields: z.record(z.string(), z.any()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ path, method, fields, confirm }: { path: string; method: "POST" | "DELETE"; fields?: Record<string, unknown>; confirm?: boolean }) => {
      try {
        if (!confirm) return previewResult(`Meta ${method} ${path}`, { path, method, fields: fields ?? {} });
        return jsonResult(await metaMarketingRequest(path, method, fields ?? {}));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // ── GA4 (Admin API: properties/streams/audiences/conversions; Data API: reports) ──
  server.registerTool(
    "ga4_admin_request",
    {
      title: "GA4 Admin API — Manage Properties/Streams/Audiences",
      description: `Passthrough to the Google Analytics Admin API v1beta (https://analyticsadmin.googleapis.com/v1beta) — manage properties, data streams, custom dimensions/metrics, conversion events, audiences, account/property access bindings, etc.

Args:
  - path (string): e.g. "properties/123456", "properties/123456/dataStreams", "properties/123456/conversionEvents", "accountSummaries".
  - method ("GET" | "POST" | "PATCH" | "DELETE").
  - body (object, optional): request body for POST/PATCH, exactly as the Admin API expects.
  - confirm (boolean): required true for POST/PATCH/DELETE — when false/omitted on a write, returns a preview instead of calling the API. GET always executes directly.`,
      inputSchema: {
        path: z.string().min(1),
        method: z.enum(["GET", "POST", "PATCH", "DELETE"]),
        body: z.record(z.string(), z.any()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ path, method, body, confirm }: { path: string; method: "GET" | "POST" | "PATCH" | "DELETE"; body?: Record<string, unknown>; confirm?: boolean }) => {
      try {
        if (method !== "GET" && !confirm) return previewResult(`GA4 Admin ${method} ${path}`, { path, method, body: body ?? {} });
        return jsonResult(await googleApiRequest("ga4", "https://analyticsadmin.googleapis.com/v1beta", path, method, body));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "ga4_run_report",
    {
      title: "GA4 Data API — Run Report",
      description: `Runs a report against the Google Analytics Data API v1beta (read-only) — traffic, conversions, revenue, any dimension/metric combination.

Args:
  - propertyId (string): numeric GA4 property id (no "properties/" prefix).
  - requestBody (object): a RunReportRequest body, e.g. { "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}], "dimensions": [{"name": "sessionDefaultChannelGroup"}], "metrics": [{"name": "sessions"}, {"name": "conversions"}] }.
  - realtime (boolean, optional): use runRealtimeReport instead of runReport.`,
      inputSchema: {
        propertyId: z.string().min(1),
        requestBody: z.record(z.string(), z.any()),
        realtime: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ propertyId, requestBody, realtime }: { propertyId: string; requestBody: Record<string, unknown>; realtime?: boolean }) => {
      try {
        const method = realtime ? "runRealtimeReport" : "runReport";
        const result = await googleApiRequest(
          "ga4",
          "https://analyticsdata.googleapis.com/v1beta",
          `properties/${propertyId}:${method}`,
          "POST",
          requestBody
        );
        return jsonResult(result);
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // ── Google Search Console ────────────────────────────────────────────
  server.registerTool(
    "gsc_request",
    {
      title: "Search Console API — Sites/Sitemaps/Search Analytics",
      description: `Passthrough to the Search Console API v1 (https://searchconsole.googleapis.com/v1) — list/add/delete verified sites, submit/list/delete sitemaps, run searchanalytics.query for clicks/impressions/CTR/position by query/page/country/device, URL inspection.

Args:
  - path (string): e.g. "sites", "sites/{siteUrl}/sitemaps", "urlInspection/index:inspect", "sites/{siteUrl}/searchAnalytics/query".
  - method ("GET" | "POST" | "PUT" | "DELETE").
  - body (object, optional): for POST/PUT, e.g. a searchAnalytics/query body { "startDate": "2026-08-01", "endDate": "2026-09-01", "dimensions": ["query"], "rowLimit": 25 }.
  - confirm (boolean): required true for POST/PUT/DELETE (site verification changes, sitemap submit/delete) — false/omitted returns a preview instead. GET always executes.

Note: siteUrl must be URL-encoded exactly as Search Console has it registered (e.g. "https%3A%2F%2Fadsbyshoaib.com%2F" or "sc-domain%3Aadsbyshoaib.com").`,
      inputSchema: {
        path: z.string().min(1),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
        body: z.record(z.string(), z.any()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ path, method, body, confirm }: { path: string; method: "GET" | "POST" | "PUT" | "DELETE"; body?: Record<string, unknown>; confirm?: boolean }) => {
      try {
        if (method !== "GET" && !confirm) return previewResult(`GSC ${method} ${path}`, { path, method, body: body ?? {} });
        return jsonResult(await googleApiRequest("gsc", "https://searchconsole.googleapis.com/v1", path, method, body));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );

  // ── Google Tag Manager ───────────────────────────────────────────────
  server.registerTool(
    "gtm_request",
    {
      title: "Tag Manager API — Containers/Tags/Triggers/Publish",
      description: `Passthrough to the Tag Manager API v2 (https://www.googleapis.com/tagmanager/v2) — accounts, containers, workspaces, tags, triggers, variables, versions, and publishing a version live.

Args:
  - path (string): e.g. "accounts/{accountId}/containers", "accounts/{a}/containers/{c}/workspaces/{w}/tags", "accounts/{a}/containers/{c}/versions/{v}:publish".
  - method ("GET" | "POST" | "PUT" | "DELETE").
  - body (object, optional): for POST/PUT, exactly as the Tag Manager API expects for that resource.
  - confirm (boolean): required true for POST/PUT/DELETE — a publish call pushes tags LIVE to a real website, so treat it with the same care as live ad spend. False/omitted returns a preview instead. GET always executes.`,
      inputSchema: {
        path: z.string().min(1),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]),
        body: z.record(z.string(), z.any()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ path, method, body, confirm }: { path: string; method: "GET" | "POST" | "PUT" | "DELETE"; body?: Record<string, unknown>; confirm?: boolean }) => {
      try {
        if (method !== "GET" && !confirm) return previewResult(`GTM ${method} ${path}`, { path, method, body: body ?? {} });
        return jsonResult(await googleApiRequest("gtm", "https://www.googleapis.com/tagmanager/v2", path, method, body));
      } catch (error) {
        return { content: [{ type: "text", text: formatError(error) }], isError: true };
      }
    }
  );
}
