# adsbyshoaib.com

Personal brand website for Shoaib Nabi Noor (performance marketing specialist).

**Latest status:** read `docs/WORK-LOG.md` (newest work, pending items) — and the second-brain vault memory it points to.

**Read `CLAUDE-CODE-INSTRUCTIONS.md` first** — it is the complete build guide:
tech stack, locked design system, phase order, copy rules, and brand voice.

Key rules:
- Design system is locked: Cloud `#FAFAFA` bg / Ink `#0F0F14` text / **Citrus `#FEC107` = 8% brand accent** / **Cobalt `#2196F3` = decorative-only** / **Forest `#3FA343` = sparing third accent** (rebranded 2026-09-15 to match the official designer logo — see the rebrand note in the instructions doc; token names unchanged, only hex values in `app/globals.css`).
- Citrus AND Cobalt both fail text contrast on Cloud: use them for badges, underlines, icons, decorative elements only. Text-level accents stay Ink.
- The real logo lives in `public/brand/*.svg` (`logo-horizontal`, `logo-horizontal-light` for dark bg, `logo-stacked`, `mark`) — render it via `<Image>`, never as a CSS-text wordmark.
- Copy is FINAL — never modify without Shoaib's explicit request.
- Brand voice: first person "I", never "we"; no "freelancer"/"solo" references; use "independent practice".
- Tailwind v4: design tokens live in `app/globals.css` under `@theme` (no tailwind.config.ts).
- Push to GitHub after each completed phase.

## Two-PC sync (home + office) — Shoaib's standing rule

Shoaib works on this project from a home PC and an office PC. Git is the bridge.

- **Session start:** run `git pull --autostash`, then read the top entries of `docs/WORK-LOG.md` so you know what the other PC did. Resolve any conflict by keeping both sides.
- **When Shoaib writes "Done"** (this PC's work for the day is finished), do all of this at once, without asking:
  1. Add or extend today's dated entry in `docs/WORK-LOG.md` (what was done, what is pending, gotchas) and update the memory/vault as in the auto-sync rule.
  2. `git pull --autostash`, commit everything that belongs to the project, and `git push`.
  3. Reply with one line: the commit hash, and that the other PC will see it after its next pull.
- **What to commit:** source, docs, public assets, lockfile changes that match a real dependency change. **Never commit** `.env*`, keys/tokens, `.claude/settings.local.json`, or large client/working folders (e.g. `Meezab Knowledge base/`, `client-briefs/`); list anything skipped in the reply instead of adding it. Commit messages are plain; end with the usual co-author line.
- Never force-push, and never drop a stash without Shoaib's say-so.
