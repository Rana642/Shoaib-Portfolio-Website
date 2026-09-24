import "server-only";
import sharp from "sharp";
import { db } from "./dashboard/db";
import { fetchObject } from "./storage";
import { sniff } from "./kb-files";

/**
 * Public CDN mirror of knowledge-base IMAGES, for Claude web.
 *
 * The claude.ai widget/artifact sandbox only lets external resources load from
 * cdnjs.cloudflare.com, esm.sh, cdn.jsdelivr.net, unpkg.com and Google Fonts —
 * so our own /api/kb/file URLs render as broken images there. jsDelivr serves
 * any public GitHub repo, so images Claude web must embed are copied (as web
 * renditions, ≤1600 px) into ONE public repo shared by all projects, under
 * `<project-slug>/<folder>/<name>.<ext>`, and referenced as
 * https://cdn.jsdelivr.net/gh/<repo>@<commit-sha>/<path> (pinned to the commit,
 * so URLs are immutable and never stale-cached).
 *
 * PUBLIC by design: only what the user explicitly publishes
 * (kb_publish_to_cdn, confirm-gated) ever goes there. Needs KB_CDN_GITHUB_TOKEN
 * (fine-grained PAT, contents: read/write on that one repo); KB_CDN_REPO
 * overrides the default repo.
 */

export const CDN_REPO = process.env.KB_CDN_REPO || "Rana642/adsbyshoaib-kb-assets";
const token = process.env.KB_CDN_GITHUB_TOKEN || "";
const BRANCH = "main";

export const slugifyName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";

/** storage key → pinned jsDelivr URL, for whichever of `keys` were published. */
export async function cdnUrlMap(keys: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await db.from("kb_cdn_files").select("storage_key, cdn_url").in("storage_key", unique);
  return new Map((data ?? []).map((r: { storage_key: string; cdn_url: string }) => [r.storage_key, r.cdn_url]));
}

async function github(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`https://api.github.com/repos/${CDN_REPO}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "adsbyshoaib-kb-cdn",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
}

// One commit at a time per process: parallel contents-API writes to the same
// branch conflict (409).
let queue: Promise<unknown> = Promise.resolve();
const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => undefined);
  return run;
};

/** Web rendition for the CDN: ≤1600 px; JPEG (white-flattened) unless the image has transparency. */
export async function prepareCdnImage(buffer: Buffer): Promise<{ out: Buffer; ext: "png" | "jpg" }> {
  const type = sniff(buffer);
  if (!type?.mime.startsWith("image/")) throw new Error("Only images can be published to the CDN.");
  const meta = await sharp(buffer).metadata();
  const pipeline = sharp(buffer).rotate().resize({ width: 1600, withoutEnlargement: true });
  if (meta.hasAlpha) return { out: await pipeline.png().toBuffer(), ext: "png" };
  return { out: await pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer(), ext: "jpg" };
}

export type PublishInput = { storageKey: string; folder: string; name: string };

/** Copies one stored image to the public repo (idempotent per storage key). */
export function publishToCdn(input: PublishInput): Promise<{ cdn_url: string; path: string; reused: boolean }> {
  return serialize(async () => {
    if (!token) throw new Error("KB_CDN_GITHUB_TOKEN isn't configured (fine-grained GitHub token, contents read/write on the CDN repo).");
    const { data: existing } = await db.from("kb_cdn_files").select("cdn_url, cdn_path").eq("storage_key", input.storageKey).maybeSingle();
    if (existing) return { cdn_url: existing.cdn_url as string, path: existing.cdn_path as string, reused: true };

    const { buffer } = await fetchObject(input.storageKey);
    const { out, ext } = await prepareCdnImage(buffer);

    let path = `${input.folder}/${slugifyName(input.name)}.${ext}`;
    const { data: clash } = await db.from("kb_cdn_files").select("storage_key").eq("cdn_path", path).maybeSingle();
    if (clash) path = `${input.folder}/${slugifyName(input.name)}-${Date.now().toString(36)}.${ext}`;

    let sha: string | undefined;
    for (let attempt = 0; attempt < 3 && !sha; attempt++) {
      const head = await github("GET", `contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${BRANCH}`);
      const previous = head.ok ? ((await head.json()) as { sha?: string }).sha : undefined;
      const put = await github("PUT", `contents/${path.split("/").map(encodeURIComponent).join("/")}`, {
        message: `Add ${path}`,
        content: out.toString("base64"),
        branch: BRANCH,
        ...(previous ? { sha: previous } : {}),
      });
      if (put.ok) {
        sha = ((await put.json()) as { commit: { sha: string } }).commit.sha;
      } else if (put.status !== 409 && put.status !== 422) {
        throw new Error(`GitHub refused the upload (HTTP ${put.status}). Check the token and that ${CDN_REPO} exists.`);
      }
    }
    if (!sha) throw new Error("GitHub kept rejecting the upload (conflict) — try again.");

    const cdn_url = `https://cdn.jsdelivr.net/gh/${CDN_REPO}@${sha}/${path}`;
    const { error } = await db.from("kb_cdn_files").upsert({ storage_key: input.storageKey, cdn_path: path, cdn_url, commit_sha: sha, published_at: new Date().toISOString() }, { onConflict: "storage_key" });
    if (error) throw new Error(error.message);
    return { cdn_url, path, reused: false };
  });
}
