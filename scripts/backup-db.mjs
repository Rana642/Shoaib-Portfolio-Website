// @ts-nocheck
/**
 * Zero-dependency database backup for the Supabase project.
 *
 * Why this exists: the Free plan has NO automatic backups, so if the
 * database is ever lost, every row (clients, leads, quotations, invoices,
 * intakes, and the vault ciphertext) is gone for good. The SCHEMA is already
 * version-controlled in supabase/dashboard-schema.sql — what changes and
 * isn't in git is the DATA, which is exactly what this dumps.
 *
 * How it works: reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * from .env.local (never printed, never committed), pulls every row of every
 * table via the REST API using the service-role key (bypasses RLS), and
 * writes one timestamped JSON file into ./backups/ (gitignored).
 *
 * It is strictly READ-ONLY — it only ever runs SELECTs, so it can never harm
 * the live database.
 *
 * Run it:   npm run backup:db
 * Restore:  the JSON is a plain { tables: { name: [rows...] } } map — rows can
 *           be re-inserted after re-applying supabase/dashboard-schema.sql.
 *
 * Do this on a schedule you're comfortable with (e.g. weekly, and always
 * before a risky change). Keep a copy off your PC too (cloud drive / USB).
 */

import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Minimal .env.local parser (no dependency on Node's --env-file flag) ──
function loadEnvLocal() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2];
    // Strip surrounding quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

// Transient abuse-tracking rows — no value in a backup.
const SKIP_TABLES = new Set(["rate_limits"]);

// Reliable fallback if table auto-discovery ever fails (kept in sync with
// supabase/dashboard-schema.sql).
const KNOWN_TABLES = [
  "settings", "clients", "client_projects", "catalog_items", "catalog_bundle_members",
  "document_counters", "quotations", "quotation_items", "proposals", "proposal_items",
  "proposal_projects", "agreements", "onboarding_intakes", "invoices", "invoice_items",
  "payments", "client_intakes", "vault_meta", "vault_entries",
];

async function discoverTables(baseUrl, key) {
  // PostgREST exposes an OpenAPI spec at the REST root that lists every table.
  try {
    const res = await fetch(`${baseUrl}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`spec ${res.status}`);
    const spec = await res.json();
    const names = Object.keys(spec.definitions || {});
    if (names.length) return names;
    // Newer OpenAPI: derive from paths like "/tableName".
    const fromPaths = Object.keys(spec.paths || {})
      .map((p) => p.replace(/^\//, ""))
      .filter((p) => p && !p.startsWith("rpc/"));
    if (fromPaths.length) return [...new Set(fromPaths)];
  } catch {
    // fall through to the known list
  }
  return KNOWN_TABLES;
}

async function dumpTable(baseUrl, key, table) {
  const pageSize = 1000;
  let offset = 0;
  const rows = [];
  for (;;) {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${body.slice(0, 120)}`);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  const env = loadEnvLocal();
  const baseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!baseUrl || !key) {
    console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  console.log("• Discovering tables…");
  const discovered = await discoverTables(baseUrl, key);
  const tables = discovered.filter((t) => !SKIP_TABLES.has(t)).sort();
  console.log(`• ${tables.length} tables to back up\n`);

  const out = { _meta: { created_at: new Date().toISOString(), source: baseUrl, tables: {} }, tables: {} };
  let totalRows = 0;
  const failures = [];

  for (const table of tables) {
    process.stdout.write(`  ${table} … `);
    try {
      const rows = await dumpTable(baseUrl, key, table);
      out.tables[table] = rows;
      out._meta.tables[table] = rows.length;
      totalRows += rows.length;
      console.log(`${rows.length} rows`);
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      failures.push({ table, error: err.message });
    }
  }

  const backupsDir = join(ROOT, "backups");
  mkdirSync(backupsDir, { recursive: true });
  const now = new Date();
  const stamp = now.toISOString().replace(/:/g, "-").replace(/\..+/, "").replace("T", "_");
  const file = join(backupsDir, `backup-${stamp}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2), "utf8");

  const sizeMB = (statSync(file).size / (1024 * 1024)).toFixed(2);
  console.log(`\n✓ Backup complete — ${totalRows} rows across ${Object.keys(out.tables).length} tables`);
  console.log(`  Saved: ${file} (${sizeMB} MB)`);
  if (failures.length) {
    console.log(`\n⚠ ${failures.length} table(s) failed:`);
    for (const f of failures) console.log(`   - ${f.table}: ${f.error}`);
    process.exit(2);
  }
  console.log("\nKeep a copy off this PC too (cloud drive / USB) — a backup on the");
  console.log("same machine won't help if the machine is lost.");
}

main().catch((err) => {
  console.error("✗ Backup failed:", err.message);
  process.exit(1);
});
