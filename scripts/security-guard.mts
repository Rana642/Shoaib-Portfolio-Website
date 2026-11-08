/**
 * Security Guard: deterministic audit of this repo. Run it any time:
 *
 *   npx tsx scripts/security-guard.mts            # full audit, writes docs/security/reports/
 *   npx tsx scripts/security-guard.mts --no-npm   # skip the (networked) dependency audit
 *   node --env-file=.env.local --import tsx scripts/security-guard.mts --live   # also checks the LIVE database (read-only)
 *
 * Rules are listed in docs/security/GUARD.md. Findings you have judged safe go
 * in docs/security/accepted-risks.json (with a reason and an expiry date), which
 * is how the guard is "trained": it never reports the same accepted thing twice,
 * and it shows what is NEW since the last run. It reads files and runs read-only
 * commands (git, npm audit). It changes nothing.
 *
 * Heuristics, not proof: a clean report means "no known pattern matched", not
 * "secure". Anything it flags is a question for a human (or Claude) to answer.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "docs", "security", "reports");
const ACCEPTED_FILE = path.join(ROOT, "docs", "security", "accepted-risks.json");
const SKIP_NPM = process.argv.includes("--no-npm");
const LIVE = process.argv.includes("--live");

type Severity = "critical" | "high" | "medium" | "low" | "info";
type Finding = { rule: string; severity: Severity; file: string; line?: number; message: string };
type Accepted = { rule: string; file?: string; match?: string; reason: string; until: string; by?: string };

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
const findings: Finding[] = [];
const add = (rule: string, severity: Severity, file: string, message: string, line?: number) => findings.push({ rule, severity, file: file.replace(/\\/g, "/"), message, line });

const git = (args: string[]) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
};
const read = (file: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    return "";
  }
};
const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
const redact = (s: string) => `${s.slice(0, 6)}…(${s.length} chars)`;

// ── file inventory: tracked files + untracked files that are not ignored (i.e. about to be committed)
const tracked = git(["ls-files"]);
const untracked = git(["ls-files", "--others", "--exclude-standard"]);
const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|json|md|mdx|sql|yml|yaml|env|example|txt|html|css|toml|sh|ps1)$/i;
const inScan = (f: string) =>
  TEXT_EXT.test(f) && !/(^|\/)(node_modules|\.next)\//.test(f) && !/package-lock\.json$/.test(f) && !f.startsWith("docs/security/") && f !== "scripts/security-guard.mts" && !f.startsWith("public/");
const allFiles = [...new Set([...tracked, ...untracked])].filter((f) => fs.existsSync(path.join(ROOT, f)));
const scanFiles = allFiles.filter((f) => inScan(f) && fs.statSync(path.join(ROOT, f)).size < 1_500_000);
const code = scanFiles.filter((f) => /\.(ts|tsx|js|jsx|mjs|mts)$/.test(f));

// ── SG-001 secrets in files that are (or would be) committed
const SECRET_PATTERNS: { name: string; re: RegExp; severity: Severity }[] = [
  { name: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g, severity: "high" },
  { name: "Google OAuth client secret", re: /GOCSPX-[A-Za-z0-9_-]{20,}/g, severity: "high" },
  { name: "OpenAI/Anthropic-style key", re: /\bsk-[A-Za-z0-9_-]{32,}/g, severity: "high" },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, severity: "high" },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, severity: "high" },
  { name: "Meta access token", re: /\bEAA[A-Za-z0-9]{60,}/g, severity: "high" },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g, severity: "critical" },
  { name: "Database URL with password", re: /postgres(?:ql)?:\/\/[^:\s/'"]+:[^@\s'"]{6,}@/g, severity: "high" },
];
for (const f of scanFiles) {
  if (/\.example$|\.env\.local\.example$/.test(f)) continue;
  const text = read(f);
  for (const p of SECRET_PATTERNS) {
    for (const m of text.matchAll(p.re)) add("SG-001", p.severity, f, `${p.name} found: ${redact(m[0])}`, lineOf(text, m.index ?? 0));
  }
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{20,}\.(eyJ[A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{20,}/g)) {
    let role = "";
    try {
      role = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")).role ?? "";
    } catch {
      /* not a JWT we can read */
    }
    if (role === "service_role") add("SG-001", "critical", f, `Supabase service_role JWT found: ${redact(m[0])}`, lineOf(text, m.index ?? 0));
    else if (role !== "anon") add("SG-001", "medium", f, `A JWT is written in this file: ${redact(m[0])} (role: ${role || "unknown"})`, lineOf(text, m.index ?? 0));
  }
}
for (const f of allFiles) {
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.example$/.test(f)) add("SG-001", "critical", f, "An .env file is tracked or would be committed");
}

// ── SG-002 sensitive-looking untracked folders that are not ignored (risk of an accidental `git add .`)
const risky = new Set<string>();
for (const f of untracked) {
  const top = f.split("/")[0];
  if (/(client|brief|knowledge|backup|secret|credential|export|dump|private)/i.test(top)) risky.add(top);
}
for (const d of risky) add("SG-002", "medium", d, "Untracked folder that looks like client/working data and is not in .gitignore: an accidental `git add .` would commit it");

// ── SG-003 NEXT_PUBLIC_ variables that look like secrets (they are shipped to every browser)
for (const f of code) {
  const text = read(f);
  for (const m of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PRIVATE|PASSWORD|SERVICE_ROLE|TOKEN)[A-Z0-9_]*/g)) add("SG-003", "high", f, `${m[0]} is public by name but looks like a secret`, lineOf(text, m.index ?? 0));
}

// ── SG-004 server actions must re-check auth (they are public endpoints)
const AUTH_RE = /getAdminUser|assertAuthed|assertAdmin|requireAdmin|requirePortal|getPortalUser|getPortalSession|getUser\s*\(|auth\.getClaims|getClaims\(|isCronRequest|verifyAccessToken|validateToken|requireUser|ensureAdmin|requirePortalUser|getSessionUser/;
for (const f of code.filter((x) => /^(lib|app|components)\//.test(x))) {
  const text = read(f);
  if (!/^\s*["']use server["']/m.test(text.slice(0, 400))) continue;
  const parts = text.split(/\n(?=(?:export\s+)?async\s+function\s)/);
  // Local (non-exported) helpers that themselves authenticate, followed transitively (helper -> helper -> requirePortalUser).
  const helpers = new Map<string, string>();
  for (const part of parts.slice(1)) {
    const m = part.match(/^(export\s+)?async\s+function\s+(\w+)/);
    if (m && !m[1]) helpers.set(m[2], part);
  }
  const authed = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [hname, body] of helpers) {
      if (authed.has(hname)) continue;
      if (AUTH_RE.test(body) || [...authed].some((a) => new RegExp(`\\b${a}\\s*\\(`).test(body))) {
        authed.add(hname);
        changed = true;
      }
    }
  }
  for (const part of parts.slice(1)) {
    const m = part.match(/^export\s+async\s+function\s+(\w+)/);
    if (!m) continue;
    const ok = AUTH_RE.test(part) || [...authed].some((a) => new RegExp(`\\b${a}\\s*\\(`).test(part));
    if (!ok) add("SG-004", "high", f, `Server action '${m[1]}' has no recognised auth check in its body`, lineOf(text, text.indexOf(part)));
  }
}

// ── SG-005 / 011 / 012 / 013 API routes
for (const f of code.filter((x) => /^app\/.*route\.ts$/.test(x))) {
  const text = read(f);
  const route = "/" + f.replace(/^app\//, "").replace(/\/route\.ts$/, "");
  const writes = /export\s+(?:async\s+)?(?:function|const)\s+(POST|PUT|PATCH|DELETE)\b/.test(text) || /export\s+const\s+(POST|PUT|PATCH|DELETE)\b/.test(text);
  const hasAuth = AUTH_RE.test(text) || /isAdmin\(/.test(text);
  const hasSig = /timingSafeEqual|createHmac|x-hub-signature|verifySignature|webhook.*secret/i.test(text);
  const hasRate = /rateLimit\(/.test(text);
  const tokenUrl = /\[token\]|\[name\]/.test(f);
  const isCallback = /callback/i.test(f);
  const isWellKnown = f.startsWith("app/.well-known/");
  const isHealth = /health/.test(f);
  if (/cron/i.test(f) && !/isCronRequest|CRON_SECRET/.test(text)) add("SG-013", "high", f, `Cron route ${route} does not check isCronRequest/CRON_SECRET`);
  if (/webhook/i.test(f) && !hasSig) add("SG-011", "high", f, `Webhook route ${route} has no signature verification (HMAC/timingSafeEqual)`);
  if (isCallback && !/\bstate\b/.test(text)) add("SG-012", "high", f, `OAuth callback ${route} does not mention 'state' (CSRF check)`);
  if (!hasAuth && !hasSig && !hasRate && !tokenUrl && !isCallback && !isWellKnown && !isHealth && !/cron/i.test(f)) {
    add("SG-005", writes ? "high" : "medium", f, `Route ${route} has no recognised auth, signature, token or rate-limit guard${writes ? " (accepts writes)" : ""}`);
  }
}

// ── SG-006 client components importing server-only / service-role modules
for (const f of code) {
  const text = read(f);
  if (!/^\s*["']use client["']/m.test(text.slice(0, 400))) continue;
  for (const m of text.matchAll(/from\s+["']([^"']*(?:dashboard\/db|supabase\/admin|supabase-admin|\/db["']|server-only|google-oauth-token|api-vault-crypto)[^"']*)["']/g)) add("SG-006", "high", f, `Client component imports server-side module '${m[1]}'`, lineOf(text, m.index ?? 0));
}

// ── SG-007 dangerous patterns
for (const f of code.filter((x) => /^(app|lib|components)\//.test(x))) {
  const text = read(f);
  for (const [re, label, sev] of [
    [/dangerouslySetInnerHTML/g, "dangerouslySetInnerHTML: make sure the HTML is sanitised or fully ours", "medium"],
    [/\beval\s*\(/g, "eval()", "high"],
    [/new\s+Function\s*\(/g, "new Function()", "high"],
    [/from\s+["'](?:node:)?child_process["']/g, "child_process in app code", "high"],
  ] as [RegExp, string, Severity][]) {
    for (const m of text.matchAll(re)) add("SG-007", sev, f, label, lineOf(text, m.index ?? 0));
  }
}

// ── SG-008 SSRF heuristic: an API route that fetches a URL taken from the request
for (const f of code.filter((x) => /^app\/api\/.*route\.ts$/.test(x))) {
  const text = read(f);
  if (/searchParams\.get\(["'](url|src|link|redirect)["']\)|body\.(url|src|link)\b|\.json\(\)[^;]*\burl\b/.test(text) && /\bfetch\(\s*(?!["'`])/.test(text)) add("SG-008", "medium", f, "Route appears to fetch a URL that comes from the request: check it cannot be pointed at internal addresses (SSRF)");
}

// ── SG-009 security headers
const proxy = read("proxy.ts");
for (const [h, re] of [
  ["Content-Security-Policy", /Content-Security-Policy/i],
  ["Strict-Transport-Security", /Strict-Transport-Security/i],
  ["X-Content-Type-Options", /X-Content-Type-Options/i],
  ["Referrer-Policy", /Referrer-Policy/i],
  ["clickjacking protection (frame-ancestors / X-Frame-Options)", /frame-ancestors|X-Frame-Options/i],
  ["Permissions-Policy", /Permissions-Policy/i],
] as [string, RegExp][]) if (!re.test(proxy) && !re.test(read("next.config.ts"))) add("SG-009", "medium", "proxy.ts", `Security header missing: ${h}`);

// ── SG-014 every table has row level security enabled (the anon key is public)
const sqlFiles = allFiles.filter((f) => /^supabase\/.*\.sql$/.test(f));
const created = new Map<string, string>();
const rls = new Set<string>();
for (const f of sqlFiles) {
  const text = read(f).replace(/--.*$/gm, "");
  for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi)) created.set(m[1].toLowerCase(), f);
  for (const m of text.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?(\w+)"?\s+enable\s+row\s+level\s+security/gi)) rls.add(m[1].toLowerCase());
}
for (const [table, f] of created) if (!rls.has(table)) add("SG-014", "high", f, `Table '${table}' has no 'enable row level security' in the schema files`);

// ── SG-015 MCP endpoint must verify tokens; list what a token can reach
{
  const mcp = read("app/api/mcp/route.ts");
  if (mcp && !/verifyAccessToken/.test(mcp)) add("SG-015", "critical", "app/api/mcp/route.ts", "The MCP endpoint does not verify access tokens");
  if (mcp && /registerMarketingTools|registerRemoteSocialTools/.test(mcp)) add("SG-015", "info", "app/api/mcp/route.ts", "Every valid MCP token currently gets ALL tool groups (Planner, marketing APIs, Gmail/Workspace, KB). Planned fix: user MCP with scoped grants (see memory: MCP access control plan)");
}

// ── SG-016 .gitignore basics
{
  const gi = read(".gitignore");
  for (const [label, re] of [[".env files", /^\.env/m], ["node_modules", /node_modules/], [".vercel", /\.vercel/]] as [string, RegExp][]) if (!re.test(gi)) add("SG-016", "high", ".gitignore", `.gitignore does not cover ${label}`);
}

// ── SG-010 dependency vulnerabilities (network)
if (!SKIP_NPM) {
  try {
    let out = "";
    try {
      out = execSync("npm audit --json --omit=dev", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      out = String((e as { stdout?: string }).stdout ?? "");
    }
    const json = JSON.parse(out || "{}") as { vulnerabilities?: Record<string, { severity: Severity; via: unknown[]; fixAvailable: unknown }> };
    for (const [pkg, v] of Object.entries(json.vulnerabilities ?? {})) {
      if (v.severity === "critical" || v.severity === "high") add("SG-010", v.severity, "package.json", `Dependency '${pkg}' has a ${v.severity} vulnerability (fix available: ${v.fixAvailable ? "yes" : "no"})`);
      else if (v.severity === "moderate" as string) add("SG-010", "low", "package.json", `Dependency '${pkg}' has a moderate vulnerability`);
    }
  } catch {
    add("SG-010", "info", "package.json", "npm audit could not run (offline or npm missing); dependency check skipped");
  }
}


// ── SG-020 / SG-021 LIVE database checks (only with --live; read-only; needs SUPABASE_DB_URL in the environment)
if (LIVE) {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) add("SG-020", "info", "env", "--live was requested but SUPABASE_DB_URL is not set; live checks skipped");
  else {
    try {
      // @ts-ignore pg ships no type declarations in this repo (dev-only dependency)
      const { default: pg } = await import("pg");
      const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      const t = await client.query(`select c.relname as t, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`);
      const noRls = t.rows.filter((r: { rls: boolean }) => !r.rls).map((r: { t: string }) => r.t);
      const anon = await client.query(`select distinct table_name from information_schema.role_table_grants where grantee='anon' and table_schema='public'`);
      const anonTables = new Set(anon.rows.map((r: { table_name: string }) => r.table_name));
      await client.end();
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      for (const table of noRls) {
        if (!anonTables.has(table)) continue;
        // The anon key ships to every browser. Count rows it can see (HEAD request, never reads content).
        let visible = "unknown";
        if (url && key) {
          try {
            const res = await fetch(`${url}/rest/v1/${table}?limit=1`, { method: "HEAD", headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" } });
            visible = res.headers.get("content-range") ?? `HTTP ${res.status}`;
          } catch {
            /* network */
          }
        }
        add("SG-020", "critical", `database:${table}`, `Live table '${table}' has row level security OFF and the public anon role has access. Rows visible with the public key: ${visible}. Fix: alter table ${table} enable row level security;`);
      }
      if (!noRls.length) add("SG-021", "info", "database", `All ${t.rows.length} public tables have row level security on`);
    } catch (e) {
      add("SG-020", "info", "database", `Live check failed: ${(e as Error).message.slice(0, 120)}`);
    }
  }
}

// ── accepted risks (the guard's training)
const accepted: Accepted[] = fs.existsSync(ACCEPTED_FILE) ? JSON.parse(fs.readFileSync(ACCEPTED_FILE, "utf8")) : [];
const today = new Date().toISOString().slice(0, 10);
const isAccepted = (f: Finding) =>
  accepted.some((a) => a.rule === f.rule && a.until >= today && (!a.file || new RegExp(a.file).test(f.file)) && (!a.match || new RegExp(a.match, "i").test(f.message)));
const expired = accepted.filter((a) => a.until < today);
const open = findings.filter((f) => !isAccepted(f));
const suppressed = findings.length - open.length;
const fp = (f: Finding) => crypto.createHash("sha1").update(`${f.rule}|${f.file}|${f.message}`).digest("hex").slice(0, 12);

// ── diff against the last run
fs.mkdirSync(REPORT_DIR, { recursive: true });
const latestPath = path.join(REPORT_DIR, "latest.json");
const previous: string[] = fs.existsSync(latestPath) ? (JSON.parse(fs.readFileSync(latestPath, "utf8")).fingerprints ?? []) : [];
const nowPrints = open.map(fp);
const isNew = (f: Finding) => previous.length > 0 && !previous.includes(fp(f));
const resolved = previous.filter((p) => !nowPrints.includes(p)).length;

open.sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file));
const counts = Object.fromEntries(SEV_ORDER.map((s) => [s, open.filter((f) => f.severity === s).length]));

const lines: string[] = [
  `# Security Guard report: ${today}`,
  "",
  `Open findings: **${open.length}** (${SEV_ORDER.map((s) => `${counts[s]} ${s}`).join(", ")}). Accepted/suppressed: ${suppressed}. ` +
    (previous.length ? `New since last run: ${open.filter(isNew).length}. Resolved since last run: ${resolved}.` : "First run: no previous report to compare with."),
  "",
  `Scanned ${scanFiles.length} text files, ${created.size} database tables, ${code.filter((x) => /^app\/.*route\.ts$/.test(x)).length} API routes. Heuristic checks: a clean result is not proof of security.`,
  "",
];
if (expired.length) lines.push(`> ${expired.length} accepted risk(s) have EXPIRED and are reported again: ${expired.map((a) => a.rule + (a.file ? ` (${a.file})` : "")).join(", ")}`, "");
for (const sev of SEV_ORDER) {
  const group = open.filter((f) => f.severity === sev);
  if (!group.length) continue;
  lines.push(`## ${sev.toUpperCase()} (${group.length})`, "");
  for (const f of group) lines.push(`- ${isNew(f) ? "**NEW** " : ""}\`${f.rule}\` ${f.file}${f.line ? `:${f.line}` : ""}: ${f.message}`);
  lines.push("");
}
const report = lines.join("\n");
fs.writeFileSync(path.join(REPORT_DIR, `${today}.md`), report);
fs.writeFileSync(latestPath, JSON.stringify({ date: today, counts, fingerprints: nowPrints }, null, 2));
console.log(report);

const blocking = open.filter((f) => (f.severity === "critical" || f.severity === "high") && (previous.length === 0 || isNew(f)));
process.exit(blocking.length && previous.length ? 1 : 0);
