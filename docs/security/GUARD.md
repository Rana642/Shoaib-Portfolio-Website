# Security Guard

An audit that runs on demand (and later on a schedule) over the whole system, remembers what Shoaib has judged safe, and shows only what is new. Built 2026-11-08.

```
npx tsx scripts/security-guard.mts --no-npm                  # repo checks only
npx tsx scripts/security-guard.mts                           # + dependency audit (needs network)
npx tsx --env-file=.env.local scripts/security-guard.mts --live   # + LIVE database checks (read-only)
```

Output goes to `docs/security/reports/<date>.md` (local, git-ignored) and the console. It reads files and runs read-only commands only. It never edits code or the database. A clean report means "no known pattern matched", not "secure".

## Rules (the registry)

| ID | What it looks for | Severity |
|---|---|---|
| SG-001 | Secrets in files that are or would be committed (Google/OpenAI/GitHub/Slack/Meta keys, private keys, DB URLs, Supabase service_role JWT); tracked `.env` files | high / critical |
| SG-002 | Untracked client/working folders not in `.gitignore` (accidental `git add .`) | medium |
| SG-003 | `NEXT_PUBLIC_` variables whose name looks secret | high |
| SG-004 | Server actions without an auth check (follows local helper functions that authenticate) | high |
| SG-005 | API routes with no auth / token / signature / rate-limit guard | medium, high if it accepts writes |
| SG-006 | Client components importing server-only or service-role modules | high |
| SG-007 | `dangerouslySetInnerHTML`, `eval`, `new Function`, `child_process` in app code | medium / high |
| SG-008 | Routes that fetch a URL taken from the request (SSRF) | medium |
| SG-009 | Missing security headers (CSP, HSTS, nosniff, referrer, clickjacking, permissions) | medium |
| SG-010 | Vulnerable dependencies (`npm audit`, runtime deps) | by advisory |
| SG-011 | Webhook routes without signature verification | high |
| SG-012 | OAuth callbacks that never use `state` | high |
| SG-013 | Cron routes not checking `isCronRequest` | high |
| SG-014 | Tables with no `enable row level security` in `supabase/*.sql` | high |
| SG-015 | MCP endpoint token check; what a token can reach | critical / info |
| SG-016 | `.gitignore` basics | high |
| SG-020 | LIVE: public tables with RLS off that the public anon role can reach, with the row count the public key can see | critical |
| SG-021 | LIVE: all tables have RLS on | info |

## How to train it

1. **Teach it what is safe.** When a finding is by design, add an entry to `docs/security/accepted-risks.json`:
   `{ "rule": "SG-005", "file": "regex of the path", "match": "optional regex of the message", "reason": "why it is fine", "until": "YYYY-MM-DD", "by": "who decided" }`.
   It is hidden until `until`, then comes back for a fresh decision. Prefer short expiries (6 months).
2. **Teach it something new.** After any incident or review, add a rule: a new check in `scripts/security-guard.mts` and a row in the table above. Write the rule from the real failure, not from theory.
3. **Look at the diff, not the pile.** The report says what is NEW since the last run and what was resolved. Act on NEW critical/high first.
4. **Ask Claude to run the skill** `security-guard` (see `.claude/skills/security-guard/SKILL.md`): it runs the script, investigates each finding properly, proposes fixes and updates accepted risks only with Shoaib's say-so.

## What it does not cover yet (ideas for the next training rounds)

- Per-endpoint rate-limit coverage for every public write route; password-reset abuse.
- Supabase Auth settings (2FA for the admin, email confirmation, password policy) and Vercel settings: they live in the vendors' dashboards, so they are a manual checklist.
- Storage bucket policies (R2 / Supabase) and CORS.
- Secrets in git history (the script scans the working tree only).
- Third-party OAuth app scopes (Google, Meta, LinkedIn, TikTok): review the granted scopes quarterly.
- The planned user MCP (scoped grants) once built: check every tool enforces the user's projects.
- A scheduled run (weekly) that reports only NEW critical/high.
