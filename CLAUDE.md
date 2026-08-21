# adsbyshoaib.com

Personal brand website for Shoaib Nabi Noor (performance marketing specialist).

**Read `CLAUDE-CODE-INSTRUCTIONS.md` first** — it is the complete build guide:
tech stack, locked design system, phase order, copy rules, and brand voice.

Key rules:
- Design system is locked: Cloud `#FAFAFA` bg / Ink `#0F0F14` text / **Citrus `#EAB308` = 8% brand accent** / **Cobalt `#1E40AF` = 2% highlight** (accent roles were swapped 2026-08-21 — see the swap note in the instructions doc).
- Citrus fails text contrast on Cloud: use it for badges, underlines, icons, decorative elements only. Text-level accents stay Ink or Cobalt.
- Copy is FINAL — never modify without Shoaib's explicit request.
- Brand voice: first person "I", never "we"; no "freelancer"/"solo" references; use "independent practice".
- Tailwind v4: design tokens live in `app/globals.css` under `@theme` (no tailwind.config.ts).
- Push to GitHub after each completed phase.
