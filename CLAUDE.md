# adsbyshoaib.com

Personal brand website for Shoaib Nabi Noor (performance marketing specialist).

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
