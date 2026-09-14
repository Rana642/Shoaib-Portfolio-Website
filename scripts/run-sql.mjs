#!/usr/bin/env node
// One-off/ad-hoc schema runner: `node scripts/run-sql.mjs path/to/file.sql`
// or `node scripts/run-sql.mjs -c "select 1"`. Uses SUPABASE_DB_URL (the
// direct Postgres connection string, .env.local-only, never committed) so
// future schema changes don't require opening the Supabase SQL Editor by
// hand. Never print SUPABASE_DB_URL itself — it carries the DB password.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import pg from "pg";

config({ path: ".env.local" });

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/run-sql.mjs <file.sql> | -c \"<sql>\"");
  process.exit(1);
}
const sql = arg === "-c" ? process.argv[3] : readFileSync(arg, "utf8");
if (!sql) {
  console.error("No SQL given.");
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is not set in .env.local.");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
  const result = await client.query(sql);
  console.log("OK.", Array.isArray(result) ? `${result.length} statements.` : result.command || "done");
} catch (err) {
  console.error("SQL ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
