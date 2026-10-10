/**
 * Manual test for the read-only Planner MCP tools (social_list_posts,
 * social_get_post_image_url). Spins up an in-memory MCP server + client,
 * calls the tools like Claude would, and checks the download link against
 * a running server.
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-post-tools.mts [baseUrl]
 *
 * baseUrl (default http://localhost:3000) is where the link route is tested.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerPostListingTools } from "../lib/post-listing-tools";

const base = process.argv[2] ?? "http://localhost:3000";
let failures = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failures++;
};

const server = new McpServer({ name: "test", version: "0" });
registerPostListingTools(server);
const [a, b] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "test-client", version: "0" });
await Promise.all([server.connect(a), client.connect(b)]);

type R = { content: { type: string; text?: string; data?: string; mimeType?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as unknown as R;

// 1. Everything, with the summary
const all = await call("social_list_posts", { limit: 5 });
const total = Number(all.structuredContent?.total ?? 0);
check("list: returns a total and summary", !all.isError && total > 0 && !!all.structuredContent?.summary, `${total} posts`);
check("list: at most `limit` rows", ((all.structuredContent?.posts as unknown[]) ?? []).length <= 5);
check("list: no email addresses in output", !/@[a-z0-9-]+\.[a-z]/i.test(JSON.stringify(all)));
console.log(all.content[0].text?.split("\n").slice(0, 12).join("\n"));

// 2. Filters: project + status + this week
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
const avenzaHeld = await call("social_list_posts", { project: "Avenza", status: ["needs_changes", "pending_caption"], from: weekAgo });
check("list: project+status+from filter works", !avenzaHeld.isError, String(avenzaHeld.structuredContent?.total ?? avenzaHeld.content[0].text));
const posts = (avenzaHeld.structuredContent?.posts as { status: string; project_label: string }[]) ?? [];
check("list: only requested statuses", posts.every((p) => p.status === "needs_changes" || p.status === "pending_caption"));
check("list: only Avenza projects", posts.every((p) => /avenza/i.test(p.project_label)));

// 3. Bad input → clear errors
const badDate = await call("social_list_posts", { from: "next tuesday" });
check("list: bad date is a clear error", !!badDate.isError && /Bad from date/.test(badDate.content[0].text ?? ""));
const noProject = await call("social_list_posts", { project: "zzz-no-such-project" });
check("list: unknown project is a clear error", !!noProject.isError && /No project matches/.test(noProject.content[0].text ?? ""));
const missing = await call("social_get_post_image_url", { postId: "00000000-0000-4000-8000-000000000000" });
check("image: unknown post is a clear error", !!missing.isError && /No post found/.test(missing.content[0].text ?? ""));

// 4. Image + link for a held post if there is one, else the newest post
const held = await call("social_list_posts", { status: "needs_changes", limit: 1 });
const target = ((held.structuredContent?.posts as { id: string }[]) ?? [])[0] ?? ((all.structuredContent?.posts as { id: string }[]) ?? [])[0];
const img = await call("social_get_post_image_url", { postId: target.id });
const sc = img.structuredContent as { filename: string; status: string; view_url: string; download_url: string; uploader: string } | undefined;
check("image: returns details", !img.isError && !!sc?.filename, `${sc?.filename} (${sc?.status}) by ${sc?.uploader}`);
const imageBlock = img.content.find((c) => c.type === "image");
check("image: inline image block", !!imageBlock?.data, imageBlock ? `${imageBlock.mimeType}, ${Math.round((imageBlock.data!.length * 3) / 4 / 1024)} KB` : "none (video without cover?)");
check("image: no email addresses in output", !/@[a-z0-9-]+\.[a-z]/i.test(JSON.stringify(img).replace(/https?:\/\/\S+/g, "")));
// Only the post id, an expiry and a signature — no bucket host, object key or AWS signature.
check(
  "image: link has no storage path",
  !!sc && /^https:\/\/adsbyshoaib\.com\/api\/social\/post-image\/[^/?]+\?p=[0-9a-f-]{36}&e=\d+&sig=[\w-]+$/.test(sc.view_url) && !/r2\.|cloudflarestorage|X-Amz/i.test(sc.view_url),
  sc?.view_url.replace(/sig=[^&]+/, "sig=…")
);

// 5. The link itself (against the running server)
if (sc) {
  const local = sc.download_url.replace("https://adsbyshoaib.com", base);
  const ok = await fetch(local);
  check("link: download works", ok.ok, `${ok.status} ${ok.headers.get("content-type")} ${ok.headers.get("content-disposition")}`);
  const tampered = await fetch(local.replace(/sig=([^&])/, "sig=x$1"));
  check("link: tampered signature refused", tampered.status === 403);
  const expired = await fetch(local.replace(/e=\d+/, "e=1700000000"));
  check("link: expired/changed expiry refused", expired.status === 403);
}

await client.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
